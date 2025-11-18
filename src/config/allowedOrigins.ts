// <== ALLOWED ORIGINS FOR CORS ==>
const allowedOrigins: string[] = [
  // FRONTEND LOCALHOST
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5174",
];

export default allowedOrigins;
