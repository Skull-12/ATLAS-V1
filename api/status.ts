import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() !== '' &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  res.status(200).json({
    online: true,
    aiConfigured: hasKey,
    model: 'gemini-3.8-flash',
    searchAvailable: true,
    timestamp: new Date().toISOString(),
  });
}
