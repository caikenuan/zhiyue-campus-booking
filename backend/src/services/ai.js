import { config } from '../config.js';
import { pool } from '../db.js';
import { getAvailability } from './availability.js';
import { addDays, addMinutes, formatDate, formatTime, parseDate, startOfDay } from '../utils/time.js';

const TYPE_LABELS = {
  SEMINAR: '研讨室',
  STUDY: '自习区',
  PIANO: '琴房',
  ACTIVITY: '活动室',
  SPORTS: '运动场地',
};

const CHINESE_DIGITS = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseChineseNumber(text) {
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  if (text === '半') return 0.5;
  if (text.length === 1) return CHINESE_DIGITS[text] ?? null;
  if (text === '十') return 10;
  if (text.startsWith('十')) return 10 + (CHINESE_DIGITS[text.slice(1)] ?? 0);
  if (text.endsWith('十')) return (CHINESE_DIGITS[text[0]] ?? 0) * 10;
  if (text.includes('十')) {
    const [tens, ones] = text.split('十');
    return (CHINESE_DIGITS[tens] ?? 0) * 10 + (CHINESE_DIGITS[ones] ?? 0);
  }
  return null;
}

function parseRuleIntent(message) {
  const text = String(message || '').trim();
  const today = startOfDay(new Date());
  let date = null;

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    date = parseDate(iso[0]);
  } else if (/今天|今日/.test(text)) {
    date = today;
  } else if (/明天|明日/.test(text)) {
    date = addDays(today, 1);
  }
  if (!date) date = addDays(today, 1);

  let startTime = '14:00';
  const clock = /(\d{1,2}):(\d{2})/.exec(text);
  if (clock) {
    const hour = Math.min(23, Number(clock[1]));
    const minute = Math.min(59, Number(clock[2]));
    startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } else {
    const spoken = /(上午|中午|下午|晚上)?\s*([0-9]{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:点|时)\s*(半|[0-9]{1,2}|[一二三四五六七八九十]{1,3})?/.exec(text);
    if (spoken) {
      const period = spoken[1] || '';
      let hour = parseChineseNumber(spoken[2]);
      const minutePart = spoken[3] ? parseChineseNumber(spoken[3]) : 0;
      if (hour !== null) {
        const minute = minutePart === 0.5 ? 30 : Number(minutePart || 0);
        if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
        if (period === '中午' && hour < 11) hour += 12;
        startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
  }

  let durationMinutes = 60;
  if (/半\s*个?\s*小时|半小时/.test(text)) {
    durationMinutes = 30;
  } else {
    const hourMatch = /([0-9]+|[一二两三四五六七八九十]+)\s*个?\s*小时/.exec(text);
    const minuteMatch = /([0-9]+|[一二两三四五六七八九十]+)\s*分钟/.exec(text);
    if (hourMatch) {
      const hours = parseChineseNumber(hourMatch[1]);
      if (hours) durationMinutes = Math.min(240, Math.round(hours * 60));
    } else if (minuteMatch) {
      const minutes = parseChineseNumber(minuteMatch[1]);
      if (minutes) durationMinutes = Math.min(240, Math.max(30, minutes));
    }
  }
  durationMinutes = Math.max(30, Math.ceil(durationMinutes / 30) * 30);

  const peopleMatch = /([0-9]+|[一二两三四五六七八九十]+)\s*个?\s*人/.exec(text);
  const people = peopleMatch ? parseChineseNumber(peopleMatch[1]) || 1 : 1;

  let resourceType = null;
  if (/琴|钢琴/.test(text)) resourceType = 'PIANO';
  else if (/研讨|讨论|开会|会议|小组作业/.test(text)) resourceType = 'SEMINAR';
  else if (/自习|学习|看书|安静/.test(text)) resourceType = 'STUDY';
  else if (/羽毛球|球|运动|打球/.test(text)) resourceType = 'SPORTS';
  else if (/活动|社团|排练|聚会/.test(text)) resourceType = 'ACTIVITY';

  return {
    date: formatDate(date),
    startTime,
    durationMinutes,
    people: Math.max(1, Number(people) || 1),
    resourceType,
    preference: text,
  };
}

async function parseWithLlm(message) {
  if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) return null;
  const today = formatDate(new Date());
  const tomorrow = formatDate(addDays(startOfDay(new Date()), 1));
  const system = [
    '你是校园预约小程序的意图解析器。',
    '只输出 JSON，不要输出解释。',
    '字段：date(YYYY-MM-DD)、startTime(HH:mm)、durationMinutes(30-240，30 的倍数)、people(整数)、resourceType(SEMINAR/STUDY/PIANO/ACTIVITY/SPORTS 或 null)、preference(字符串)。',
    `今天是 ${today}，明天是 ${tomorrow}。用户没有说日期时优先明天。`,
    '不要判断有没有空位，只解析用户想约什么。',
  ].join('\n');

  try {
    const response = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const date = parseDate(parsed.date);
    if (!date) return null;
    return {
      date: formatDate(date),
      startTime: /^\d{2}:\d{2}$/.test(parsed.startTime) ? parsed.startTime : '14:00',
      durationMinutes: Math.min(240, Math.max(30, Math.ceil(Number(parsed.durationMinutes || 60) / 30) * 30)),
      people: Math.max(1, Number(parsed.people) || 1),
      resourceType: TYPE_LABELS[parsed.resourceType] ? parsed.resourceType : null,
      preference: String(parsed.preference || message),
    };
  } catch {
    return null;
  }
}

function requestedStart(intent) {
  const [hour, minute] = intent.startTime.split(':').map(Number);
  return { hour, minute };
}

export async function findSeats(message) {
  const llmIntent = await parseWithLlm(message);
  const intent = llmIntent || parseRuleIntent(message);
  const source = llmIntent ? 'llm' : 'rule';

  const [resources] = await pool.query(
    "SELECT * FROM resources WHERE status = 'OPEN' ORDER BY capacity ASC, id ASC",
  );

  const date = parseDate(intent.date);
  if (!date) {
    return { interpretation: intent, candidates: [], source, fallback: source === 'rule' };
  }

  const candidates = [];
  for (const resource of resources) {
    if (intent.resourceType && resource.type !== intent.resourceType) continue;
    if (Number(resource.capacity) < intent.people) continue;

    const availability = await getAvailability(resource.id, intent.date);
    const { hour, minute } = requestedStart(intent);
    const wanted = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);

    let best = null;
    for (const segment of availability.segments) {
      const segmentStart = new Date(segment.start.replace(' ', 'T'));
      const segmentEnd = new Date(segment.end.replace(' ', 'T'));
      let candidateStart = wanted > segmentStart ? wanted : segmentStart;
      const remainder = candidateStart.getMinutes() % 30;
      if (remainder !== 0) {
        candidateStart = addMinutes(candidateStart, 30 - remainder);
      }
      const candidateEnd = addMinutes(candidateStart, intent.durationMinutes);
      if (candidateEnd > segmentEnd) continue;
      if (!best || candidateStart < best.start) {
        best = { start: candidateStart, end: candidateEnd };
      }
    }
    if (!best) continue;

    const typeLabel = TYPE_LABELS[resource.type] || resource.type;
    candidates.push({
      resourceId: Number(resource.id),
      resourceName: resource.name,
      type: resource.type,
      typeLabel,
      building: resource.building,
      room: resource.room,
      capacity: Number(resource.capacity),
      startAt: `${intent.date} ${formatTime(best.start)}:00`,
      endAt: `${intent.date} ${formatTime(best.end)}:00`,
      startTime: formatTime(best.start),
      endTime: formatTime(best.end),
      reason: `${typeLabel}，可容纳 ${resource.capacity} 人，${formatTime(best.start)}-${formatTime(best.end)} 空闲`,
      score: (intent.resourceType === resource.type ? 100 : 0) + Math.max(0, 30 - Number(resource.capacity)),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.startAt.localeCompare(b.startAt));
  return {
    interpretation: intent,
    candidates: candidates.slice(0, 3),
    source,
    fallback: source === 'rule',
    note: candidates.length === 0
      ? '这个条件暂时没有合适空位，可以换个时间或场地类型试试。'
      : undefined,
  };
}

export function describeIntent(intent) {
  const type = intent.resourceType ? TYPE_LABELS[intent.resourceType] : '任意场地';
  return `${intent.date} ${intent.startTime}，${intent.durationMinutes} 分钟，${intent.people} 人，${type}`;
}
