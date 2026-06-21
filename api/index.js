const axios = require("axios");

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // Capture whether the URL used by VLC contains 'qur1' or '1060'
    const isAlternative = req.url.includes("qur1") || req.url.includes("1060");
    const slug = isAlternative ? "qur1" : "qur";
    const targetUrl = `https://qmcconnect.qa/api/StreamServices/${slug}/chunks.m3u8`;

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Referer": "https://www.quranradio.qa/",
        "Origin": "https://www.quranradio.qa",
        "Accept": "*/*"
    };

    try {
        const response = await axios.get(targetUrl, { headers });
        const manifestText = response.data;

        const baseUrl = `https://qmcconnect.qa/api/StreamServices/${slug}/`;
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
        return res.status(500).send("Proxy error handling streaming headers.");
    }
};
