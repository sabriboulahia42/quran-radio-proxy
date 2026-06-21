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

    const baseHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Referer": "https://www.quranradio.qa/",
        "Origin": "https://www.quranradio.qa",
        "Accept": "*/*"
    };

    let selectedSlug = primarySlug;
    let targetUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/chunks.m3u8`;
    let responseData = null;

    // We cycle through both stations sequentially inside a single try block to pass cookies forward
    for (let currentSlug of [primarySlug, fallbackSlug]) {
        targetUrl = `https://qmcconnect.qa/api/StreamServices/${currentSlug}/chunks.m3u8`;
        selectedSlug = currentSlug;

        try {
            // First step: Attempt to get the manifest
            const step1 = await axios.get(targetUrl, { headers: baseHeaders, timeout: 3000 });
            
            if (step1.status === 200 && step1.data) {
                responseData = step1.data;
                
                // If the server gave us a firewall cookie, merge it into our subsequent request headers
                const setCookieHeader = step1.headers["set-cookie"];
                if (setCookieHeader) {
                    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join("; ") : setCookieHeader;
                    baseHeaders["Cookie"] = cookieStr.split(";")[0]; // Extracts the raw cookiesession1 assignment
                }
                
                // Double check data authenticity by making sure it looks like a real HLS manifest
                if (responseData.includes("#EXTM3U")) {
                    break; 
                }
            }
        } catch (e) {
            // If the primary channel hits a server block or error, loop cleanly to try the fallback
            responseData = null;
        }
    }

    // Both endpoints failed to clear the firewall session
    if (!responseData) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(502).send("Couldn't find the best station . Try again");
    }

    // Rewrite relative chunks to full absolute server layouts
    const baseUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/`;
    const lines = responseData.split("\n");
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
