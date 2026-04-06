export const runtime = 'edge';

export async function GET(request: Request) {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    return Response.json({
        ok: true,
        ts: Date.now(),
        ip: forwarded?.split(',')[0]?.trim() || realIp || 'unknown',
        forwarded,
        realIp,
    });
}
