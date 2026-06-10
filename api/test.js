module.exports = (req, res) => {
  res.status(200).json({ 
    message: "API test endpoint working",
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  });
};
