import { PrismaClient } from '@prisma/client';
import { extractPhoneFromText } from '../utils/phoneExtractor';

const prisma = new PrismaClient();

async function backfill() {
    console.log('Starting complete client backfill...');

    // Get own Gmail account emails to skip
    const ownAccounts = await prisma.gmailAccount.findMany({ select: { email: true } });
    const ownEmails = new Set(ownAccounts.map(a => a.email.toLowerCase()));
    console.log(`Own accounts to skip: ${[...ownEmails].join(', ')}`);

    // Process emails in batches to avoid memory issues
    const BATCH_SIZE = 500;
    let skip = 0;
    let clientCount = 0;
    let updatedCount = 0;
    let totalProcessed = 0;

    // Track contacts we've already processed to avoid redundant updates
    const processedContacts = new Map<string, { lastEmailAt: Date; gmailAccountId: string | null }>();

    while (true) {
        const messages = await prisma.emailMessage.findMany({
            select: {
                id: true,
                direction: true,
                fromEmail: true,
                toEmail: true,
                sentAt: true,
                gmailAccountId: true,
                body: true,
                snippet: true,
            },
            orderBy: { sentAt: 'asc' },
            skip,
            take: BATCH_SIZE,
        });

        if (messages.length === 0) break;
        totalProcessed += messages.length;
        console.log(`Processing batch ${skip / BATCH_SIZE + 1} (${messages.length} emails, total: ${totalProcessed})...`);

        for (const msg of messages) {
            const emailBody = msg.body ?? msg.snippet ?? '';

            // Determine contact emails based on direction
            const contactEmails: string[] = [];

            if (msg.direction === 'RECEIVED' && msg.fromEmail) {
                // Sender = client
                contactEmails.push(msg.fromEmail);
            }
            if (msg.direction === 'SENT' && msg.toEmail) {
                // Recipients = clients (to field may have comma-separated emails)
                const toList = msg.toEmail.split(/[,;]/).map(e => e.trim());
                contactEmails.push(...toList);
            }

            for (const emailAddr of contactEmails) {
                // Clean email — handle "Name <email@example.com>" format
                const cleanEmail = emailAddr
                    .replace(/.*<(.+)>/, '$1')
                    .trim()
                    .toLowerCase();

                if (!cleanEmail || !cleanEmail.includes('@')) continue;
                if (ownEmails.has(cleanEmail)) continue;

                // Check if we already have a newer entry for this contact
                const existing = processedContacts.get(cleanEmail);
                if (existing && msg.sentAt && existing.lastEmailAt >= msg.sentAt) continue;

                // Track this as the latest for this email
                if (msg.sentAt) {
                    processedContacts.set(cleanEmail, {
                        lastEmailAt: msg.sentAt,
                        gmailAccountId: msg.gmailAccountId,
                    });
                }
            }
        }

        skip += BATCH_SIZE;
    }

    console.log(`\nScanned ${totalProcessed} emails. Found ${processedContacts.size} unique external contacts.`);
    console.log('Applying updates...');

    // Now batch-update all contacts
    for (const [email, info] of processedContacts) {
        try {
            // Find or create contact
            let contact = await prisma.contact.findUnique({
                where: { email },
                select: { id: true, isClient: true, contactType: true, phone: true, lastEmailAt: true },
            });

            if (!contact) {
                // Create new contact
                contact = await prisma.contact.create({
                    data: {
                        email,
                        name: email.split('@')[0],
                        isClient: true,
                        isLead: true,
                        contactType: 'CLIENT',
                        becameClientAt: info.lastEmailAt,
                        pipelineStage: 'COLD_LEAD',
                        lastEmailAt: info.lastEmailAt,
                        ...(info.gmailAccountId ? { lastGmailAccountId: info.gmailAccountId } : {}),
                    },
                    select: { id: true, isClient: true, contactType: true, phone: true, lastEmailAt: true },
                });
                clientCount++;
                continue;
            }

            // Try to extract phone from the latest email if contact doesn't have one
            let extractedPhone: string | undefined;
            if (!contact.phone) {
                // Fetch the most recent email body for this contact
                const latestMsg = await prisma.emailMessage.findFirst({
                    where: {
                        OR: [
                            { fromEmail: { contains: email } },
                            { toEmail: { contains: email } },
                        ],
                    },
                    orderBy: { sentAt: 'desc' },
                    select: { body: true, snippet: true },
                });
                const body = latestMsg?.body ?? latestMsg?.snippet ?? '';
                const phone = extractPhoneFromText(body);
                if (phone) extractedPhone = phone;
            }

            const isFirstTime = contact.contactType !== 'CLIENT';
            const isNewer = !contact.lastEmailAt || info.lastEmailAt > contact.lastEmailAt;

            await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    isClient: true,
                    isLead: true,
                    contactType: 'CLIENT',
                    ...(isFirstTime ? { becameClientAt: info.lastEmailAt } : {}),
                    ...(isNewer ? {
                        lastEmailAt: info.lastEmailAt,
                        ...(info.gmailAccountId ? { lastGmailAccountId: info.gmailAccountId } : {}),
                    } : {}),
                    ...(extractedPhone ? { phone: extractedPhone } : {}),
                },
            });

            if (isFirstTime) clientCount++;
            else updatedCount++;
        } catch (err: any) {
            // Skip duplicates or other errors
            if (!err.message?.includes('Unique constraint')) {
                console.error(`Error processing ${email}:`, err.message);
            }
        }
    }

    console.log(`\nBackfill complete!`);
    console.log(`  New clients: ${clientCount}`);
    console.log(`  Updated existing: ${updatedCount}`);
    console.log(`  Total emails scanned: ${totalProcessed}`);

    await prisma.$disconnect();
}

backfill().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
