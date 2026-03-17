import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient } from '../../../../src/services/gmailClientFactory';
import { getMessageBody, extractAttachmentMetadata } from '../../../../src/utils/gmailBodyParser';
import { refreshAccessToken } from '../../../../src/services/googleAuthService';

export async function GET(request: NextRequest) {
  try {
    // 1. Extract and validate query params
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');
    const accountId = searchParams.get('accountId');

    if (!threadId || !accountId) {
      return NextResponse.json({ error: 'Missing threadId or accountId' }, { status: 400 });
    }

    // 2. Get authenticated Gmail client
    let gmail;
    try {
      gmail = await getGmailClient(accountId);
    } catch (err: any) {
      // Try token refresh if initial auth fails
      try {
        await refreshAccessToken(accountId);
        gmail = await getGmailClient(accountId);
      } catch {
        return NextResponse.json({ error: 'auth_required', fallback: true }, { status: 401 });
      }
    }

    // 3. Fetch thread from Gmail API (returns ALL messages in one call)
    let threadData;
    try {
      const res = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });
      threadData = res.data;
    } catch (err: any) {
      if (err.code === 404) {
        return NextResponse.json({ error: 'not_found', fallback: true }, { status: 404 });
      }
      if (err.code === 429) {
        return NextResponse.json({ error: 'rate_limited', retryAfter: 30 }, { status: 429 });
      }
      // For auth errors, try refresh once
      if (err.code === 401 || err.message?.includes('invalid_grant')) {
        try {
          await refreshAccessToken(accountId);
          gmail = await getGmailClient(accountId);
          const retryRes = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'full',
          });
          threadData = retryRes.data;
        } catch {
          return NextResponse.json({ error: 'auth_required', fallback: true }, { status: 401 });
        }
      } else {
        throw err;
      }
    }

    // 4. Extract bodies and attachments from each message
    const bodies: Record<string, string> = {};
    const attachments: Record<string, Array<{ id: string; filename: string; mimeType: string; size: number }>> = {};

    for (const message of threadData.messages || []) {
      if (message.id && message.payload) {
        bodies[message.id] = getMessageBody(message.payload);
        attachments[message.id] = extractAttachmentMetadata(message.payload);
      }
    }

    // 5. Return with cache headers
    const response = NextResponse.json({ bodies, attachments });
    response.headers.set('Cache-Control', 'private, max-age=300');
    return response;

  } catch (error: any) {
    console.error('[Body Fetch] Error:', error?.message || error);
    return NextResponse.json({ error: 'fetch_failed', fallback: true }, { status: 500 });
  }
}
