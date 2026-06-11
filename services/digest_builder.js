'use strict';

/**
 * Marketing Command Digest Builder
 * Converts intake leads into operator-ready digest items with timestamps, priority, action status.
 */

function ageDisplay(ageMinutes) {
  if (ageMinutes < 0) return 'Unknown';
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function calculatePriority(intake) {
  // NEW intakes = URGENT (need quick follow-up)
  if (intake.status === 'NEW') return 'URGENT';
  // CONTACTED = IMPORTANT (in progress)
  if (intake.status === 'CONTACTED') return 'IMPORTANT';
  // QUOTED / CLOSED = NORMAL (waiting or done)
  return 'NORMAL';
}

function calculateActionStatus(intake) {
  if (intake.status === 'NEW') return 'Needs Steve';
  if (intake.status === 'CONTACTED') return 'Waiting on Other';
  if (intake.status === 'QUOTED') return 'Waiting on Other';
  return 'Auto-handled';
}

function formatTimestamp(dateStr) {
  try {
    // Parse "Apr 17, 3:00 PM" format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { timestamp: '[TIMESTAMP UNAVAILABLE]', ageMinutes: -1 };
    }

    const now = new Date();
    const ageMs = now.getTime() - date.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);

    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'
    });

    const parts = formatter.formatToParts(date);
    const dateFormatted = `${parts.find(p => p.type === 'month').value} ${parts.find(p => p.type === 'day').value}, ${parts.find(p => p.type === 'year').value}`;
    const timeFormatted = `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value} ${parts.find(p => p.type === 'dayPeriod').value}`;

    return {
      timestamp: `[${dateFormatted} · ${timeFormatted} · ${ageDisplay(ageMinutes)}]`,
      ageMinutes: Math.max(ageMinutes, 0)
    };
  } catch (e) {
    return { timestamp: '[TIMESTAMP UNAVAILABLE]', ageMinutes: -1 };
  }
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function intakesToDigestItems(intakes) {
  return intakes
    .filter(i => i.submittedAt)
    .map(intake => {
      const { timestamp, ageMinutes } = formatTimestamp(intake.submittedAt);
      const priority = calculatePriority(intake);
      const actionStatus = calculateActionStatus(intake);

      const preview = [
        intake.businessName,
        intake.businessType,
        intake.painPoint ? `Pain: ${intake.painPoint}` : '',
        intake.package ? `Package: ${intake.package}` : '',
        intake.budget ? `Budget: ${intake.budget}` : ''
      ].filter(Boolean).join(' · ').slice(0, 300);

      return {
        timestamp,
        ageMinutes,
        source: 'Marketing Command',
        contactName: `${intake.firstName} ${intake.lastName}`,
        email: intake.email,
        phone: intake.phone,
        businessName: intake.businessName,
        subject: `Lead: ${intake.businessName} (${intake.businessType})`,
        bodyPreview: preview,
        priority,
        actionStatus,
        status: intake.status,
        package: intake.package,
        budget: intake.budget,
        timing: intake.timing,
        originalIntake: intake
      };
    })
    .sort((a, b) => {
      const timeA = a.ageMinutes >= 0 ? a.ageMinutes : Infinity;
      const timeB = b.ageMinutes >= 0 ? b.ageMinutes : Infinity;
      return timeA - timeB; // oldest first within digest
    });
}

function priorityEmoji(p) {
  switch (p) {
    case 'CRITICAL': return '🚨';
    case 'URGENT': return '⏰';
    case 'IMPORTANT': return '📌';
    case 'NORMAL': return '📋';
    case 'LOW': return '🧊';
    default: return '❓';
  }
}

function renderIntakeItemHtml(item) {
  return `<div style="padding:12px 14px;margin:10px 0;border-left:5px solid #0a1f44;background:#f8fafc;border-radius:5px;">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
  <div style="flex:1;">
    <div style="font-size:11px;color:#7a869a;margin-bottom:4px;">
      ${esc(item.timestamp)} · Source: ${esc(item.source)}
    </div>
    <div style="font-weight:700;color:#0a1f44;font-size:14px;margin-bottom:4px;word-break:break-word;">
      ${priorityEmoji(item.priority)} ${esc(item.subject)}
    </div>
    <div style="font-size:12px;color:#2a3346;margin-bottom:6px;">
      <b>Contact:</b> ${esc(item.contactName)} · <b>Status:</b> ${esc(item.actionStatus)}
    </div>
    <div style="font-size:11px;color:#556;">
      ${esc(item.email)}${item.phone ? ' · ' + esc(item.phone) : ''}
    </div>
  </div>
</div>

<div style="font-size:12px;color:#556;margin:8px 0;padding:8px;background:#f1f5f9;border-radius:3px;line-height:1.5;word-break:break-word;">
  <b>Intake Summary:</b><br>
  ${esc(item.bodyPreview)}
</div>
</div>`;
}

function buildMarketingDigestHtml(intakes, baseUrl = '') {
  const items = intakesToDigestItems(intakes);
  const newItems = items.filter(i => i.status === 'NEW');
  const contactedItems = items.filter(i => i.status === 'CONTACTED' || i.status === 'QUOTED');

  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const sectionHtml = [
    newItems.length > 0 ? `
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#0a1f44;border-bottom:2px solid #C9A84C;padding-bottom:4px;margin:22px 0 8px;">⏰ NEW LEADS (${newItems.length})</h3>
${newItems.map(renderIntakeItemHtml).join('')}
    ` : '',
    contactedItems.length > 0 ? `
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#0a1f44;border-bottom:2px solid #C9A84C;padding-bottom:4px;margin:22px 0 8px;">📌 IN PROGRESS (${contactedItems.length})</h3>
${contactedItems.map(renderIntakeItemHtml).join('')}
    ` : ''
  ].filter(Boolean).join('');

  const auditHtml = `
<div style="margin-top:24px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;font-size:11px;color:#556;line-height:1.6;">
  <b style="color:#0a1f44;">Marketing Digest Audit:</b><br>
  • Total leads: ${items.length}<br>
  • New leads: ${newItems.length}<br>
  • In progress: ${contactedItems.length}<br>
  • Run: ${now}<br>
</div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#fff;">
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;width:100%;max-width:680px;margin:0 auto;padding:16px;color:#1a2233;box-sizing:border-box;">

<div style="border-bottom:3px double #0a1f44;padding-bottom:10px;margin-bottom:12px;">
  <div style="font-size:18px;font-weight:700;color:#0a1f44;letter-spacing:.04em;">MARKETING COMMAND · DIGEST</div>
  <div style="font-size:12px;color:#7a869a;">${now} ET · ${items.length} lead${items.length !== 1 ? 's' : ''}</div>
</div>

${sectionHtml}

${auditHtml}

<p style="font-size:11px;color:#9aa5b5;margin-top:18px;border-top:1px solid #eef1f5;padding-top:8px;">Marketing Command · ${newItems.length} new lead(s) requiring follow-up</p>

</div>
</body>
</html>`;
}

module.exports = {
  intakesToDigestItems,
  buildMarketingDigestHtml,
  hasImportantContent: (intakes) => intakes.some(i => i.status === 'NEW')
};
