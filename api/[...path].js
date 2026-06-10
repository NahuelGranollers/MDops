module.exports = (req, res) => {
  const path = req.url || "";
  
  if (path.includes("health")) {
    return res.status(200).json({ ok: true, service: "api", runtime: "vercel" });
  }
  
  res.status(404).json({ error: "Not Found", path });
};
