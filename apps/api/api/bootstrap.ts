export default async function handler(req: any, res: any) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ bootstrapped: true, message: "API cargada exitosamente" }));
}
