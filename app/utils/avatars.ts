const FEMALE_NAMES = new Set([
    'mary','patricia','jennifer','linda','barbara','elizabeth','susan','jessica','sarah','karen',
    'lisa','nancy','betty','margaret','sandra','ashley','dorothy','kimberly','emily','donna',
    'michelle','carol','amanda','melissa','deborah','stephanie','rebecca','sharon','laura','cynthia',
    'kathleen','amy','angela','shirley','anna','brenda','pamela','emma','nicole','helen',
    'samantha','katherine','christine','debra','rachel','carolyn','janet','catherine','maria','heather',
    'diane','ruth','julie','olivia','joyce','virginia','victoria','kelly','lauren','christina',
    'joan','evelyn','judith','megan','andrea','cheryl','hannah','jacqueline','martha','gloria',
    'teresa','ann','sara','madison','frances','kathryn','janice','jean','abigail','alice',
    'judy','sophia','grace','denise','amber','doris','marilyn','danielle','beverly','isabella',
    'theresa','diana','natalie','brittany','charlotte','marie','kayla','alexis','lori',
    'kari','liz','celia','carmen',
    'aisha','fatima','amina','layla','zara','noor','hana','maryam','aaliya','sana',
    'ayesha','rania','dina','lina','nadia','samira','yasmin','leila','farida','zeina',
    'sofia','lucia','elena','giulia','chiara','valentina','francesca','alessia','martina',
    'rosa','pilar','ana','isabel','alicia','claudia',
    'wei','mei','xin','yan','ling','fang','jing','hong','li','yun',
    'yuki','sakura','aoi','mio','rin','saki','mai','aya','riko',
    'priya','ananya','devi','lakshmi','pooja','neha','riya','kavya','isha','meera',
    'olga','natasha','svetlana','irina','tatiana','marina','ekaterina',
]);

const MUTED_COLORS = [
    '#E8D5F5', // soft lavender
    '#D5EAF5', // soft sky blue
    '#F5E0D5', // soft peach
    '#D5F5E0', // soft mint
    '#F5F0D5', // soft cream yellow
    '#F5D5E0', // soft pink
    '#D5F5F0', // soft teal
    '#E0D5F5', // soft periwinkle
    '#F5E8D5', // soft apricot
    '#D5F0F5', // soft ice blue
    '#F0F5D5', // soft lime
    '#F5D5D5', // soft coral
];

const MALE_AVATARS = [
    '/images/avatar-m1.svg',
    '/images/avatar-m2.svg',
    '/images/avatar-m3.svg',
    '/images/avatar-m4.svg',
    '/images/avatar-m5.svg',
    '/images/avatar-m6.svg',
    '/images/avatar-m7.svg',
    '/images/avatar-m8.svg',
    '/images/avatar-m9.svg',
    '/images/avatar-m10.svg',
];

const FEMALE_AVATARS = [
    '/images/avatar-f1.svg',
    '/images/avatar-f2.svg',
];

function nameHash(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    return hash;
}

export function getAvatarSrc(name: string): string {
    const firstName = (name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
    const isFemale = FEMALE_NAMES.has(firstName);
    const avatars = isFemale ? FEMALE_AVATARS : MALE_AVATARS;
    return avatars[nameHash(name) % avatars.length]!;
}

export function getAvatarBg(name: string): string {
    return MUTED_COLORS[nameHash(name) % MUTED_COLORS.length]!;
}
