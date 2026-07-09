const VALID_QUALITIES = ['Standard', 'Silver', 'Gold', 'Premium', 'Elite'];

function normalizeQuality(value, fallback = 'Standard') {
  const quality = String(value || fallback).trim();
  return VALID_QUALITIES.includes(quality) ? quality : fallback;
}

function recordCategoryChange(professionalProfile, fromQuality, toQuality, changedAt = new Date()) {
  const from = normalizeQuality(fromQuality);
  const to = normalizeQuality(toQuality);
  if (from === to) return;

  professionalProfile.lastCatModDate = changedAt;
  professionalProfile.qualityBeforeLastMod = from;

  if (!Array.isArray(professionalProfile.categoryChangeLog)) {
    professionalProfile.categoryChangeLog = [];
  }

  professionalProfile.categoryChangeLog.push({
    changedAt,
    fromQuality: from,
    toQuality: to
  });
}

function getMonthBounds(year, monthIndex) {
  const monthStart = new Date(year, monthIndex, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();
  return { monthStart, monthEnd, daysInMonth };
}

function getChangesWithinMonth(professionalProfile, year, monthIndex) {
  const { monthStart, monthEnd } = getMonthBounds(year, monthIndex);
  return (professionalProfile.categoryChangeLog || [])
    .filter((entry) => {
      const changedAt = new Date(entry.changedAt);
      return changedAt >= monthStart && changedAt <= monthEnd;
    })
    .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
}

function calculateMonthlyInvoiceAmount(professionalProfile, globalPricing, year, monthIndex, billableDays) {
  const { daysInMonth } = getMonthBounds(year, monthIndex);
  if (billableDays <= 0) return 0;

  const currentQuality = normalizeQuality(professionalProfile.quality);
  const changes = getChangesWithinMonth(professionalProfile, year, monthIndex);

  if (changes.length === 0) {
    const monthlyAmount = globalPricing[currentQuality] || 15000;
    return Math.round((monthlyAmount / daysInMonth) * billableDays);
  }

  const segments = [];
  let segmentStartDay = 1;
  let segmentQuality = normalizeQuality(
    changes[0].fromQuality,
    professionalProfile.qualityBeforeLastMod || currentQuality
  );

  changes.forEach((change) => {
    const changeDay = new Date(change.changedAt).getDate();
    if (changeDay > segmentStartDay) {
      segments.push({
        fromDay: segmentStartDay,
        toDay: changeDay - 1,
        quality: segmentQuality
      });
    }
    segmentStartDay = changeDay;
    segmentQuality = normalizeQuality(change.toQuality, segmentQuality);
  });

  if (segmentStartDay <= daysInMonth) {
    segments.push({
      fromDay: segmentStartDay,
      toDay: daysInMonth,
      quality: segmentQuality
    });
  }

  return segments.reduce((total, segment) => {
    const segmentCalendarDays = segment.toDay - segment.fromDay + 1;
    const segmentBillableDays = billableDays * (segmentCalendarDays / daysInMonth);
    const monthlyAmount = globalPricing[segment.quality] || 15000;
    return total + Math.round((monthlyAmount / daysInMonth) * segmentBillableDays);
  }, 0);
}

module.exports = {
  VALID_QUALITIES,
  normalizeQuality,
  recordCategoryChange,
  calculateMonthlyInvoiceAmount
};
