module.exports = (req, res) => {
  const path = req.url || "";
  
  // Health check endpoint
  if (path === "/health" || path === "/api/health") {
    return res.status(200).json({ 
      ok: true, 
      service: "api", 
      runtime: "vercel",
      timestamp: new Date().toISOString() 
    });
  }
  
  // Test endpoint
  if (path === "/test" || path === "/api/test") {
    return res.status(200).json({ 
      message: "API is working",
      path,
      method: req.method 
    });
  }
  
  // Default 404
  res.status(404).json({ 
    error: "Not Found", 
    path,
    availableEndpoints: ["/health", "/test"]
  });
};
