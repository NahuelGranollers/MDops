module.exports = (req, res) => {
  res.status(200).json({ ok: true, service: "api", runtime: "vercel", timestamp: new Date().toISOString() });
};
