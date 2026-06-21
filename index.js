module.exports = (req, res) => {
    // Dynamically captures the current domain and appends the api route and incoming queries
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    
    res.writeHead(302, {
        'Location': `/api${queryString}`
    });
    res.end();
};
