const axios = require("axios");

module.exports = async (req, res) => {
    // Enable global CORS for media players
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

    // 100% exact replica of your captured headers.
    // Note: We omit "br" and "zstd" from Accept-Encoding so Axios receives clean text instead of binary chunks.
    const strictHeaders = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "fr,ar;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Host": "qmcconnect.qa",
        "Origin": "https://www.quranradio.qa",
        "Pragma": "no-cache",
        "Referer": "https://www.quranradio.qa/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"'
    };

    let selectedSlug = primarySlug;
    let finalManifest = null;

    // Loop through primary, fallback to alternative if primary fails
    for (let currentSlug of [primarySlug, fallbackSlug]) {
        selectedSlug = currentSlug;
        const targetUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/master.m3u8`;

        try {
            // REQUEST 1 (as seen in your logs): Grab the initial cookie session
            const res1 = await axios.get(targetUrl, { headers: strictHeaders, timeout: 3500 });
            
            let authenticatedHeaders = { ...strictHeaders };
            const setCookie = res1.headers["set-cookie"];
            if (setCookie) {
                authenticatedHeaders["Cookie"] = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : setCookie.split(";")[0];
            }

            // REQUEST 2 (as seen in your logs): Re-hit master.m3u8 with the authenticated cookie
            const res2 = await axios.get(targetUrl, { headers: authenticatedHeaders, timeout: 3500 });
            
            if (res2.status === 200 && res2.data && res2.data.includes("#EXTM3U")) {
                finalManifest = res2.data;
                break; // Success! Exit the failover loop.
            }
        } catch (e) {
            finalManifest = null; // Reset and let it fall back to the next slug option
        }
    }

    if (!finalManifest) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(502).send("Couldn't find the best station . Try again");
    }

    // Rewrite any relative lines to absolute QMC Server URLs so VLC can access them
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
