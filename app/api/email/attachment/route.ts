import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient } from '../../../../src/services/gmailClientFactory';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get('messageId');
  const attachmentId = searchParams.get('attachmentId');
  const accountId = searchParams.get('accountId');
  const filename = searchParams.get('filename') || 'download';
  const mimeType = searchParams.get('mimeType') || 'application/octet-stream';

  if (!messageId || !attachmentId || !accountId) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  try {
    const gmail = await getGmailClient(accountId);

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    if (!response.data.data) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Gmail returns base64url-encoded data
    const buffer = Buffer.from(response.data.data, 'base64url');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('Attachment download error:', err?.message);

    if (err?.message?.includes('invalid_grant') || err?.status === 401) {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}
