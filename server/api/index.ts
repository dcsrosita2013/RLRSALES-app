// Vercel serverless entry — serves the Express app as a single function.
// vercel.json rewrites every request here; Express handles /api/* routing.
import app from '../src/app';

export default app;
