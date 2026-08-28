import { errorResponse, json, requireController } from '@/lib/http';

export async function POST(request: Request) {
  try {
    requireController(request);
    return json({ authenticated: true });
  } catch (error) {
    return errorResponse(error);
  }
}
