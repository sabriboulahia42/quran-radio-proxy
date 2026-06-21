const axios = require("axios");

// Helper function to quickly verify if a specific stream endpoint responds with a 200 OK
async function checkAvailability(url, headers) {
    try {
        const check = await axios.head(url, { headers, timeout: 2500 });
        return check.status === 200;
    } catch (e) {
        return false;
    }
}

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const stationParam = req.query.station || "";
    // Primary selection based on query payload
    let primarySlug = stationParam.includes("qur1") || stationParam.includes("1060") ? "qur1" : "qur";
    // Backup fallback channel alternative
    let fallbackSlug = primarySlug === "qur" ? "qur1" : "qur";

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Referer": "https://www.quranradio.qa/",
        "Origin": "https://www.quranradio.qa",
        "Accept": "*/*"
    };

    let selectedSlug = primarySlug;
    let targetUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/chunks.m3u8`;

    // Check availability of both streams
    let isPrimaryAvailable = await checkAvailability(targetUrl, headers);
    
    let fallbackUrl = `https://qmcconnect.qa/api/StreamServices/${fallbackSlug}/chunks.m3u8`;
    let isFallbackAvailable = false;

    // Only ping the fallback server if the primary is down to optimize performance
    if (!isPrimaryAvailable) {
        isFallbackAvailable = await checkAvailability(fallbackUrl, headers);
    }

    // Strict validation: if both primary AND fallback are offline, throw the error
    if (!isPrimaryAvailable && !isFallbackAvailable) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(502).send("Couldn't find the best station . Try again");
    }

    // Switch to fallback slug if the primary was the one that failed
    if (!isPrimaryAvailable && isFallbackAvailable) {
        selectedSlug = fallbackSlug;
        targetUrl = fallbackUrl;
    }

    try {
        const response = await axios.get(targetUrl, { headers });
        const manifestText = response.data;

        const baseUrl = `https://qmcconnect.qa/api/StreamServices/${selectedSlug}/`;
        const lines = manifestText.split("\n");
        const modifiedLines = lines.map(line => {
            if (line.trim() && !line.startsWith("#") && !line.startsWith("http")) {
                return baseUrl + line;
            }
            return line;
        });

        res.setHeader("Content-Type", "application/x-mpegURL");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.status(200).send(modifiedLines.join("\n"));
    } catch (error) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(502).send("Couldn't find the best station . Try again");
    }
};
