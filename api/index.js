const axios = require("axios");

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const urlString = req.url || "";
    const stationParam = req.query.station || "";
    
    const isAlternative = urlString.includes("qur1") || urlString.includes("1060") || stationParam.includes("qur1");
    let primarySlug = isAlternative ? "qur1" : "qur";
    let fallbackSlug = primarySlug === "qur" ? "qur1" : "qur";

    // Crucial: We omit 'br' and 'zstd' so the server sends plain, readable text text to our proxy
    const baseHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Referer": "https://www.quranradio.qa/",
        "Origin": "https://www.quranradio.qa",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate" 
    };

    let selectedSlug = primarySlug;
    let finalManifest = null;

    // Unified connection loop across primary and fallback channels
    for (let currentSlug of [primarySlug, fallbackSlug]) {
        selectedSlug = currentSlug;
        const masterUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/master.m3u8`;
        const chunksUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/chunks.m3u8`;

        try {
            // STEP 1: Hit master.m3u8 first to satisfy the firewall and harvest the security cookie
            const masterResponse = await axios.get(masterUrl, { headers: baseHeaders, timeout: 3500 });
            
            // Extract the cookie safely if provided
            const setCookie = masterResponse.headers["set-cookie"];
            let requestHeaders = { ...baseHeaders };
            if (setCookie) {
                requestHeaders["Cookie"] = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : setCookie.split(";")[0];
            }

            // STEP 2: Use the newly acquired cookie session to download the real chunks manifest
            const chunksResponse = await axios.get(chunksUrl, { headers: requestHeaders, timeout: 3500 });
            
            if (chunksResponse.status === 200 && chunksResponse.data && chunksResponse.data.includes("#EXTM3U")) {
                finalManifest = chunksResponse.data;
                break; // Handshake completed successfully, exit loop
            }
        } catch (e) {
            // Log error internally and fall back to the next station slug channel loop iteration
            finalManifest = null;
        }
    }

    if (!finalManifest) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(502).send("Couldn't find the best station . Try again");
    }

    // Rewrite relative chunk layouts into absolute secure addresses for VLC compatibility
    const baseUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/`;
    const lines = finalManifest.split("\n");
    const modifiedLines = lines.map(line => {
        if (line.trim() && !line.startsWith("#") && !line.startsWith("http")) {
            return baseUrl + line;
        }
        return line;
    });

    res.setHeader("Content-Type", "application/x-mpegURL");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(200).send(modifiedLines.join("\n"));
};
