import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { _mongoose?: Cache };
const cached: Cache = g._mongoose ?? (g._mongoose = { conn: null, promise: null });

function getResolvedConfig() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    throw new Error(
      "MONGODB_URI is not set in environment variables. Please add MONGODB_URI in Vercel Project Settings > Environment Variables."
    );
  }

  let uri = rawUri;
  let dbName = process.env.MONGODB_DB_NAME;

  // MongoDB Atlas is case-sensitive with names. If Atlas already has 'Fsm' (capital F)
  // but MONGODB_URI has '/fsm' (lowercase f), Atlas throws:
  // "db already exists with different case already have: [Fsm] trying to create [fsm]".
  // We automatically normalize '/fsm' to '/Fsm' and set dbName to 'Fsm' to prevent this error.
  if (!dbName && /\/fsm([/?#]|$)/i.test(uri)) {
    uri = uri.replace(/\/fsm([/?#]|$)/i, "/Fsm$1");
    dbName = "Fsm";
  }

  return { uri, dbName };
}

export async function dbConnect() {
  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  const { uri, dbName } = getResolvedConfig();

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000, // Timeout faster on serverless rather than hanging 30s
      ...(dbName ? { dbName } : {}),
    };
    cached.promise = mongoose.connect(uri, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e: unknown) {
    cached.promise = null;
    cached.conn = null;

    const err = e as Error;
    // Auto-recover if Atlas throws case collision: "already have: [Fsm] trying to create [fsm]"
    const caseMatch = typeof err?.message === "string" && err.message.match(/already have: \[([^\]]+)\]/i);
    if (caseMatch && caseMatch[1]) {
      const correctDb = caseMatch[1];
      console.warn(`[MongoDB] Auto-switching to existing database case: ${correctDb}`);
      const retryOpts: mongoose.ConnectOptions = {
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
        dbName: correctDb,
      };
      cached.promise = mongoose.connect(uri, retryOpts);
      cached.conn = await cached.promise;
      return cached.conn;
    }

    throw e;
  }
  return cached.conn;
}
