/**
 * What a phone number, email address or postcode tells us about a lead:
 * their country, area, time zone and whether it's a mobile. Used by lead
 * enrichment and the dialer (so people are called at a sensible local time).
 * Worked out locally – no data is sent anywhere.
 */

// Country calling codes → [country code, name, flag, main time zone]. Longest match wins.
const COUNTRIES = {
  44: ['GB', 'United Kingdom', '🇬🇧', 'Europe/London'], 353: ['IE', 'Ireland', '🇮🇪', 'Europe/Dublin'], 1: ['US', 'United States', '🇺🇸', 'America/New_York'],
  61: ['AU', 'Australia', '🇦🇺', 'Australia/Sydney'], 64: ['NZ', 'New Zealand', '🇳🇿', 'Pacific/Auckland'], 33: ['FR', 'France', '🇫🇷', 'Europe/Paris'],
  49: ['DE', 'Germany', '🇩🇪', 'Europe/Berlin'], 34: ['ES', 'Spain', '🇪🇸', 'Europe/Madrid'], 39: ['IT', 'Italy', '🇮🇹', 'Europe/Rome'],
  31: ['NL', 'Netherlands', '🇳🇱', 'Europe/Amsterdam'], 32: ['BE', 'Belgium', '🇧🇪', 'Europe/Brussels'], 41: ['CH', 'Switzerland', '🇨🇭', 'Europe/Zurich'],
  43: ['AT', 'Austria', '🇦🇹', 'Europe/Vienna'], 45: ['DK', 'Denmark', '🇩🇰', 'Europe/Copenhagen'], 46: ['SE', 'Sweden', '🇸🇪', 'Europe/Stockholm'],
  47: ['NO', 'Norway', '🇳🇴', 'Europe/Oslo'], 48: ['PL', 'Poland', '🇵🇱', 'Europe/Warsaw'], 351: ['PT', 'Portugal', '🇵🇹', 'Europe/Lisbon'],
  30: ['GR', 'Greece', '🇬🇷', 'Europe/Athens'], 971: ['AE', 'United Arab Emirates', '🇦🇪', 'Asia/Dubai'], 966: ['SA', 'Saudi Arabia', '🇸🇦', 'Asia/Riyadh'],
  91: ['IN', 'India', '🇮🇳', 'Asia/Kolkata'], 65: ['SG', 'Singapore', '🇸🇬', 'Asia/Singapore'], 852: ['HK', 'Hong Kong', '🇭🇰', 'Asia/Hong_Kong'],
  81: ['JP', 'Japan', '🇯🇵', 'Asia/Tokyo'], 86: ['CN', 'China', '🇨🇳', 'Asia/Shanghai'], 27: ['ZA', 'South Africa', '🇿🇦', 'Africa/Johannesburg'],
  234: ['NG', 'Nigeria', '🇳🇬', 'Africa/Lagos'], 254: ['KE', 'Kenya', '🇰🇪', 'Africa/Nairobi'], 55: ['BR', 'Brazil', '🇧🇷', 'America/Sao_Paulo'],
  52: ['MX', 'Mexico', '🇲🇽', 'America/Mexico_City'], 60: ['MY', 'Malaysia', '🇲🇾', 'Asia/Kuala_Lumpur'], 63: ['PH', 'Philippines', '🇵🇭', 'Asia/Manila'],
  62: ['ID', 'Indonesia', '🇮🇩', 'Asia/Jakarta'], 90: ['TR', 'Türkiye', '🇹🇷', 'Europe/Istanbul'], 972: ['IL', 'Israel', '🇮🇱', 'Asia/Jerusalem'],
  20: ['EG', 'Egypt', '🇪🇬', 'Africa/Cairo'], 356: ['MT', 'Malta', '🇲🇹', 'Europe/Malta'], 357: ['CY', 'Cyprus', '🇨🇾', 'Asia/Nicosia'],
};
// Countries spanning several time zones: the main one is a guess unless we know more.
const MULTI_ZONE = new Set(['US', 'AU', 'BR', 'MX', 'ID', 'CA']);

// North American area codes → [time zone, state/province]. Unknown ones fall back to Eastern (marked as a guess).
const NANP = {};
const zone = (tz, region, codes) => codes.split(' ').forEach((c) => { NANP[c] = [tz, region]; });
zone('America/Los_Angeles', 'California', '209 213 279 310 323 341 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951');
zone('America/Los_Angeles', 'Washington', '206 253 360 425 509 564');
zone('America/Los_Angeles', 'Oregon', '458 503 541 971');
zone('America/Los_Angeles', 'Nevada', '702 725 775');
zone('America/Denver', 'Colorado', '303 719 720 970 983');
zone('America/Denver', 'Utah', '385 435 801');
zone('America/Denver', 'Montana', '406');
zone('America/Denver', 'Wyoming', '307');
zone('America/Denver', 'New Mexico', '505 575');
zone('America/Boise', 'Idaho', '208 986');
zone('America/Denver', 'Texas (El Paso)', '915');
zone('America/Phoenix', 'Arizona', '480 520 602 623 928');
zone('America/Chicago', 'Texas', '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 936 940 945 956 972 979');
zone('America/Chicago', 'Illinois', '217 224 309 312 331 447 464 618 630 708 773 779 815 847 872');
zone('America/Chicago', 'Alabama', '205 251 256 334 659 938');
zone('America/Chicago', 'Arkansas', '479 501 870');
zone('America/Chicago', 'Iowa', '319 515 563 641 712');
zone('America/Chicago', 'Kansas', '316 620 785 913');
zone('America/Chicago', 'Louisiana', '225 318 337 504 985');
zone('America/Chicago', 'Minnesota', '218 320 507 612 651 763 952');
zone('America/Chicago', 'Mississippi', '228 601 662 769');
zone('America/Chicago', 'Missouri', '314 417 573 636 660 816');
zone('America/Chicago', 'Nebraska', '308 402 531');
zone('America/Chicago', 'Oklahoma', '405 539 580 918');
zone('America/Chicago', 'Wisconsin', '262 274 414 534 608 715 920');
zone('America/Chicago', 'North Dakota', '701');
zone('America/Chicago', 'South Dakota', '605');
zone('America/Chicago', 'Tennessee', '615 629 731 901 931');
zone('America/New_York', 'New York', '212 315 332 347 516 518 585 607 631 646 680 716 718 838 845 914 917 929 934');
zone('America/New_York', 'New Jersey', '201 551 609 640 732 848 856 862 908 973');
zone('America/New_York', 'Washington DC', '202');
zone('America/New_York', 'Connecticut', '203 475 860 959');
zone('America/New_York', 'Massachusetts', '339 351 413 508 617 774 781 857 978');
zone('America/New_York', 'Pennsylvania', '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878');
zone('America/New_York', 'Florida', '239 305 321 352 386 407 448 561 656 689 727 754 772 786 813 863 904 941 954');
zone('America/Chicago', 'Florida (Panhandle)', '850');
zone('America/New_York', 'Georgia', '229 404 470 478 678 706 762 770 912 943');
zone('America/New_York', 'Ohio', '216 220 234 283 326 330 380 419 440 513 567 614 740 937');
zone('America/New_York', 'North Carolina', '252 336 704 743 828 910 919 980 984');
zone('America/New_York', 'South Carolina', '803 839 843 854 864');
zone('America/New_York', 'Virginia', '276 434 540 571 703 757 804 826 948');
zone('America/New_York', 'Maryland', '240 301 410 443 667');
zone('America/New_York', 'Michigan', '231 248 269 313 517 586 616 679 734 810 947 989');
zone('America/Indiana/Indianapolis', 'Indiana', '260 317 463 574 765 812 930');
zone('America/New_York', 'Kentucky', '502 606 859');
zone('America/New_York', 'Tennessee (East)', '423 865');
zone('America/New_York', 'Maine', '207');
zone('America/New_York', 'New Hampshire', '603');
zone('America/New_York', 'Vermont', '802');
zone('America/New_York', 'Rhode Island', '401');
zone('America/New_York', 'Delaware', '302');
zone('America/New_York', 'West Virginia', '304 681');
zone('America/Anchorage', 'Alaska', '907');
zone('Pacific/Honolulu', 'Hawaii', '808');
zone('America/Toronto', 'Ontario', '226 249 289 343 365 416 437 519 548 613 647 705 905');
zone('America/Toronto', 'Quebec', '367 418 438 450 514 579 581 819 873');
zone('America/Vancouver', 'British Columbia', '236 250 604 672 778');
zone('America/Edmonton', 'Alberta', '368 403 587 780 825');
zone('America/Winnipeg', 'Manitoba', '204 431');
zone('America/Regina', 'Saskatchewan', '306 639');
zone('America/Halifax', 'Nova Scotia', '782 902');
zone('America/Moncton', 'New Brunswick', '506');
zone('America/St_Johns', 'Newfoundland', '709');
const CANADA = new Set(['Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland']);

// UK dialling codes (after +44) → area. Longest match wins.
const UK_AREAS = {
  20: 'London', 113: 'Leeds', 114: 'Sheffield', 115: 'Nottingham', 116: 'Leicester', 117: 'Bristol', 118: 'Reading', 121: 'Birmingham', 131: 'Edinburgh',
  141: 'Glasgow', 151: 'Liverpool', 161: 'Manchester', 191: 'Newcastle & Sunderland', 23: 'Southampton & Portsmouth', 24: 'Coventry', 28: 'Northern Ireland',
  29: 'Cardiff', 1223: 'Cambridge', 1224: 'Aberdeen', 1225: 'Bath', 1273: 'Brighton', 1382: 'Dundee', 1392: 'Exeter', 1452: 'Gloucester', 1603: 'Norwich',
  1642: 'Middlesbrough', 1752: 'Plymouth', 1782: 'Stoke-on-Trent', 1792: 'Swansea', 1865: 'Oxford', 1902: 'Wolverhampton', 1904: 'York', 1908: 'Milton Keynes',
  1202: 'Bournemouth', 1242: 'Cheltenham', 1271: 'Barnstaple', 1332: 'Derby', 1482: 'Hull', 1522: 'Lincoln', 1604: 'Northampton', 1733: 'Peterborough',
  1793: 'Swindon', 1872: 'Truro', 1924: 'Wakefield', 1946: 'Whitehaven',
};

// UK postcode areas → town or region.
const POSTCODE_AREAS = {
  AB: 'Aberdeen', B: 'Birmingham', BA: 'Bath', BB: 'Blackburn', BD: 'Bradford', BH: 'Bournemouth', BL: 'Bolton', BN: 'Brighton', BR: 'Bromley', BS: 'Bristol',
  BT: 'Belfast', CA: 'Carlisle', CB: 'Cambridge', CF: 'Cardiff', CH: 'Chester', CM: 'Chelmsford', CO: 'Colchester', CR: 'Croydon', CT: 'Canterbury', CV: 'Coventry',
  CW: 'Crewe', DA: 'Dartford', DE: 'Derby', DH: 'Durham', DL: 'Darlington', DN: 'Doncaster', DT: 'Dorchester', DY: 'Dudley', E: 'East London', EC: 'Central London',
  EH: 'Edinburgh', EN: 'Enfield', EX: 'Exeter', FY: 'Blackpool', G: 'Glasgow', GL: 'Gloucester', GU: 'Guildford', HA: 'Harrow', HD: 'Huddersfield', HG: 'Harrogate',
  HP: 'Hemel Hempstead', HR: 'Hereford', HU: 'Hull', HX: 'Halifax', IG: 'Ilford', IP: 'Ipswich', KT: 'Kingston upon Thames', L: 'Liverpool', LA: 'Lancaster',
  LE: 'Leicester', LN: 'Lincoln', LS: 'Leeds', LU: 'Luton', M: 'Manchester', ME: 'Medway', MK: 'Milton Keynes', N: 'North London', NE: 'Newcastle', NG: 'Nottingham',
  NN: 'Northampton', NP: 'Newport', NR: 'Norwich', NW: 'North West London', OL: 'Oldham', OX: 'Oxford', PE: 'Peterborough', PL: 'Plymouth', PO: 'Portsmouth',
  PR: 'Preston', RG: 'Reading', RH: 'Redhill', RM: 'Romford', S: 'Sheffield', SA: 'Swansea', SE: 'South East London', SG: 'Stevenage', SK: 'Stockport',
  SL: 'Slough', SM: 'Sutton', SN: 'Swindon', SO: 'Southampton', SP: 'Salisbury', SR: 'Sunderland', SS: 'Southend', ST: 'Stoke-on-Trent', SW: 'South West London',
  SY: 'Shrewsbury', TA: 'Taunton', TF: 'Telford', TN: 'Tunbridge Wells', TQ: 'Torquay', TR: 'Truro', TS: 'Teesside', TW: 'Twickenham', UB: 'Uxbridge',
  W: 'West London', WA: 'Warrington', WC: 'Central London', WD: 'Watford', WF: 'Wakefield', WN: 'Wigan', WR: 'Worcester', WS: 'Walsall', WV: 'Wolverhampton', YO: 'York',
};

export const PERSONAL_EMAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'msn.com', 'yahoo.com', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.co.uk', 'protonmail.com', 'proton.me', 'btinternet.com', 'sky.com', 'talktalk.net', 'virginmedia.com', 'ntlworld.com', 'gmx.com', 'mail.com', 'zoho.com']);

/** Everything a phone number tells us. */
export function phoneInfo(e164) {
  if (!e164 || !e164.startsWith('+')) return null;
  const digits = e164.slice(1);
  let code = null;
  for (const len of [3, 2, 1]) if (COUNTRIES[digits.slice(0, len)]) { code = digits.slice(0, len); break; }
  if (!code) return { country: null, timezone: null, estimated: true };
  let [cc, country, flag, timezone] = COUNTRIES[code];
  const national = digits.slice(code.length);
  const out = { country_code: cc, country, flag, timezone, estimated: MULTI_ZONE.has(cc), region: null, line: null };
  if (code === '44') {
    if (national.startsWith('7') && !national.startsWith('70') && !national.startsWith('76')) out.line = 'mobile';
    else if (/^(800|808)/.test(national)) out.line = 'freephone';
    else if (/^3/.test(national)) out.line = 'non-geographic';
    else {
      out.line = 'landline';
      for (const len of [4, 3, 2]) if (UK_AREAS[national.slice(0, len)]) { out.region = UK_AREAS[national.slice(0, len)]; break; }
    }
  } else if (code === '1') {
    const hit = NANP[national.slice(0, 3)];
    if (hit) {
      [out.timezone, out.region] = hit;
      out.estimated = false;
      if (CANADA.has(hit[1])) Object.assign(out, { country_code: 'CA', country: 'Canada', flag: '🇨🇦' });
    } else out.estimated = true;
  }
  return out;
}

export function emailInfo(email) {
  const m = String(email || '').toLowerCase().trim().match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  const domain = m[1];
  const personal = PERSONAL_EMAIL.has(domain);
  const stem = domain.split('.').filter((p) => !['co', 'com', 'org', 'net', 'uk', 'io', 'ltd', 'ac', 'gov', 'www'].includes(p))[0] || domain.split('.')[0];
  return {
    domain, type: personal ? 'personal' : 'business',
    website: personal ? null : `https://${domain}`,
    company_guess: personal ? null : stem.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  };
}

export function postcodeInfo(postcode) {
  const m = String(postcode || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2})\d/);
  if (!m) return null;
  return POSTCODE_AREAS[m[1]] ? { area: POSTCODE_AREAS[m[1]], timezone: m[1] === 'BT' ? 'Europe/London' : 'Europe/London' } : null;
}

/** "Thu 10:14" in a time zone, and the hour/minute and weekday there. */
export function localClock(tz, at = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) % 24;
    return { label: `${parts.weekday} ${String(hour).padStart(2, '0')}:${parts.minute}`, hour, minute: Number(parts.minute), weekday: parts.weekday, minutes: hour * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

/** Short name for a time zone, e.g. “UK time”, “US Eastern”, “Sydney”. */
export function zoneName(tz) {
  const names = {
    'Europe/London': 'UK time', 'America/New_York': 'US Eastern', 'America/Chicago': 'US Central', 'America/Denver': 'US Mountain', 'America/Phoenix': 'Arizona',
    'America/Los_Angeles': 'US Pacific', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii', 'America/Toronto': 'Toronto', 'America/Vancouver': 'Vancouver',
    'America/Indiana/Indianapolis': 'US Eastern', 'America/Boise': 'US Mountain', 'America/Edmonton': 'Alberta', 'America/Winnipeg': 'Manitoba',
  };
  return names[tz] || String(tz || '').split('/').pop().replace(/_/g, ' ');
}
