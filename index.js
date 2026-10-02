require('dotenv').config();
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot çalışıyor.'));
app.listen(process.env.PORT || 3000, () => console.log('Web sunucusu aktif.'));

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  AuditLogEvent,
  Partials,
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');

const EPHEMERAL = 64;
const COMPONENTS_V2_FLAG = 32768;
const BRAND_NAME = "Lase Bot's";

const DEFAULT_DIGITS = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
};

const DEFAULT_BUTTONS = {
  satin: { label: 'Satın Alım', emoji: '💵' },
  teknik: { label: 'Teknik Destek', emoji: '⚙️' },
  partner: { label: 'Partner', emoji: '💎' },
  diger: { label: 'Ekip Başvuru', emoji: '👥' },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.GuildMember,
    Partials.Message,
    Partials.User,
    Partials.Channel,
  ],
});

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(SETTINGS_FILE)) writeJson(SETTINGS_FILE, { guilds: {} });
  if (!fs.existsSync(TICKETS_FILE)) writeJson(TICKETS_FILE, { channels: {} });
}
ensureDataFiles();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function defaultGuildSettings() {
  return {
    logChannelId: null,
    welcomeBackground: null,
    welcomeJoinEmoji: '👋',
    welcomeLeaveEmoji: '😢',
    digitEmojis: { ...DEFAULT_DIGITS },

    voiceChannelId: null,

    roleLogChannelId: null,
    messageLogChannelId: null,
    voiceLogChannelId: null,
    auditLogChannelId: null,

    ticketPanelChannelId: null,
    ticketCategoryId: null,
    ticketClosedCategoryId: null,
    supportRoleId: null,

    panelImage: null,
    panelThumb: null,

    brandName: BRAND_NAME,

    ticketAboutEmoji: '✨',
    ticketAboutTitle: 'Ticket Sistemi Hakkında',
    ticketAboutText: 'Aşağıdaki seçeneklerden uygun olanı seçerek hemen bir ticket oluşturabilirsiniz.',
    ticketNoticeEmoji: '📣',
    ticketNoticeTitle: 'Bilgilendirme',
    ticketNoticeText: 'Sende hemen çok uygun Fiyata kesintisiz hizmetlerimizden yararlan!',

    buttonLabels: {
      satin: DEFAULT_BUTTONS.satin.label,
      teknik: DEFAULT_BUTTONS.teknik.label,
      partner: DEFAULT_BUTTONS.partner.label,
      diger: DEFAULT_BUTTONS.diger.label,
    },

    buttonEmojis: {
      satin: DEFAULT_BUTTONS.satin.emoji,
      teknik: DEFAULT_BUTTONS.teknik.emoji,
      partner: DEFAULT_BUTTONS.partner.emoji,
      diger: DEFAULT_BUTTONS.diger.emoji,
    },

    openTicketLeadText: 'Oluşturulan ticket bilgileri aşağıda belirtilmiştir:',
    openTicketReasonText: 'Lütfen ticket açma nedeninizi belirtiniz. Yetkililer en kısa sürede ilgilenecektir.',
    openTicketUserFieldTitle: 'OLUŞTURAN KULLANICI',
    openTicketCategoryFieldTitle: 'KATEGORİ',
    closeButtonLabel: 'Yetkili - Kapat',
    closeButtonEmoji: '🔒',
  };
}

function getGuildSettings(guildId) {
  const db = readJson(SETTINGS_FILE, { guilds: {} });

  if (!db.guilds[guildId]) {
    db.guilds[guildId] = defaultGuildSettings();
    writeJson(SETTINGS_FILE, db);
  }

  return db.guilds[guildId];
}

function setGuildSettings(guildId, patch) {
  const db = readJson(SETTINGS_FILE, { guilds: {} });
  const current = db.guilds[guildId] || defaultGuildSettings();

  db.guilds[guildId] = {
    ...defaultGuildSettings(),
    ...current,
    ...patch,
    digitEmojis: {
      ...defaultGuildSettings().digitEmojis,
      ...(current.digitEmojis || {}),
      ...(patch.digitEmojis || {}),
    },
    buttonEmojis: {
      ...defaultGuildSettings().buttonEmojis,
      ...(current.buttonEmojis || {}),
      ...(patch.buttonEmojis || {}),
    },
    buttonLabels: {
      ...defaultGuildSettings().buttonLabels,
      ...(current.buttonLabels || {}),
      ...(patch.buttonLabels || {}),
    },
  };

  writeJson(SETTINGS_FILE, db);
  return db.guilds[guildId];
}

function getTickets() {
  return readJson(TICKETS_FILE, { channels: {} });
}

function getTicket(channelId) {
  const db = getTickets();
  return db.channels[channelId];
}

function setTicket(channelId, patch) {
  const db = getTickets();
  db.channels[channelId] = {
    ...(db.channels[channelId] || {}),
    ...patch,
  };
  writeJson(TICKETS_FILE, db);
}

function deleteTicket(channelId) {
  const db = getTickets();
  delete db.channels[channelId];
  writeJson(TICKETS_FILE, db);
}

function isImageAttachment(att) {
  if (!att) return false;
  if (att.contentType?.startsWith('image/')) return true;
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(att.url || '');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'kullanici';
}

async function getMemberFromInteraction(interaction) {
  try {
    return await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    return null;
  }
}

function hasStaffPerm(member, cfg) {
  if (!member) return false;

  const isAdmin =
    member.permissions?.has?.(PermissionsBitField.Flags.Administrator) || false;

  const hasRole =
    !!cfg.supportRoleId && member.roles?.cache?.has?.(cfg.supportRoleId);

  return isAdmin || hasRole;
}

async function findExistingOpenTicketChannel(guild, ownerId) {
  const db = getTickets();

  for (const [channelId, data] of Object.entries(db.channels)) {
    if (data.guildId !== guild.id) continue;
    if (data.ownerId !== ownerId) continue;
    if (data.status !== 'open') continue;

    const exists = await guild.channels.fetch(channelId).catch(() => null);
    if (exists) return channelId;
  }

  return null;
}

function parseEmojiInput(input) {
  if (!input || typeof input !== 'string') return null;

  const value = input.trim();
  if (!value) return null;

  const custom = value.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (custom) {
    return {
      animated: custom[1] === 'a',
      name: custom[2],
      id: custom[3],
    };
  }

  if (value.includes('<') || value.includes('>')) return null;

  return { name: value };
}

function applyButtonEmoji(button, rawEmoji, fallbackEmoji) {
  const parsed = parseEmojiInput(rawEmoji) || parseEmojiInput(fallbackEmoji);
  if (parsed) button.setEmoji(parsed);
  return button;
}

function emojifyNumber(number, digitMap) {
  const formatted = number.toLocaleString('tr-TR');
  return formatted
    .split('')
    .map(ch => {
      if (/\d/.test(ch)) return digitMap?.[ch] ?? ch;
      return ch;
    })
    .join('');
}

function normalizeMultiline(text) {
  if (text == null) return text;
  return String(text).replace(/\\n/g, '\n').trim();
}

function quoteBlock(text) {
  const value = normalizeMultiline(text) || '';
  return value
    .split('\n')
    .filter(Boolean)
    .map(line => `> ${line}`)
    .join('\n');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize) {
  let size = startSize;

  do {
    ctx.font = `bold ${size}px sans-serif`;
    size--;
  } while (ctx.measureText(text).width > maxWidth && size > 18);

  return size + 1;
}

function drawFallbackBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0b0b0b');
  gradient.addColorStop(1, '#232323');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      50 + Math.random() * 170,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
}

async function buildWelcomeLeaveCard(member, type = 'join') {
  const cfg = getGuildSettings(member.guild.id);

  const canvas = createCanvas(1000, 360);
  const ctx = canvas.getContext('2d');

  let loaded = false;

  if (cfg.welcomeBackground) {
    try {
      const bg = await loadImage(cfg.welcomeBackground);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
      loaded = true;
    } catch {
      loaded = false;
    }
  }

  if (!loaded) {
    drawFallbackBackground(ctx, canvas.width, canvas.height);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 25, 25, 950, 310, 35);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const avatar = await loadImage(
    member.user.displayAvatarURL({ extension: 'png', size: 256 })
  );

  ctx.save();
  ctx.beginPath();
  ctx.arc(500, 110, 70, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 430, 40, 140, 140);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(500, 110, 73, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const username = member.user.username;
  const size = fitText(ctx, username, 780, 58);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillText(username, 500, 235);

  ctx.fillStyle = '#ececec';
  ctx.font = '30px sans-serif';

  const line1 =
    type === 'join'
      ? 'Sunucumuza hoş geldin, kuralları'
      : 'Sunucudan ayrıldın, görüşmek üzere.';
  const line2 =
    type === 'join'
      ? 'okumayı unutma!'
      : `${member.guild.name} seni unutmayacak.`;

  ctx.fillText(line1, 500, 280);
  ctx.fillText(line2, 500, 315);

  return await canvas.encode('png');
}

function buildTicketCreateRow(cfg) {
  const emojis = cfg.buttonEmojis || defaultGuildSettings().buttonEmojis;
  const labels = cfg.buttonLabels || defaultGuildSettings().buttonLabels;

  const satin = applyButtonEmoji(
    new ButtonBuilder()
      .setCustomId('create_ticket_satin')
      .setLabel(labels.satin || DEFAULT_BUTTONS.satin.label)
      .setStyle(ButtonStyle.Secondary),
    emojis.satin,
    DEFAULT_BUTTONS.satin.emoji
  );

  const teknik = applyButtonEmoji(
    new ButtonBuilder()
      .setCustomId('create_ticket_teknik')
      .setLabel(labels.teknik || DEFAULT_BUTTONS.teknik.label)
      .setStyle(ButtonStyle.Secondary),
    emojis.teknik,
    DEFAULT_BUTTONS.teknik.emoji
  );

  const partner = applyButtonEmoji(
    new ButtonBuilder()
      .setCustomId('create_ticket_partner')
      .setLabel(labels.partner || DEFAULT_BUTTONS.partner.label)
      .setStyle(ButtonStyle.Secondary),
    emojis.partner,
    DEFAULT_BUTTONS.partner.emoji
  );

  const diger = applyButtonEmoji(
    new ButtonBuilder()
      .setCustomId('create_ticket_diger')
      .setLabel(labels.diger || DEFAULT_BUTTONS.diger.label)
      .setStyle(ButtonStyle.Secondary),
    emojis.diger,
    DEFAULT_BUTTONS.diger.emoji
  );

  return new ActionRowBuilder().addComponents(satin, teknik, partner, diger);
}

function buildTicketOpenRow(cfg) {
  const button = new ButtonBuilder()
    .setCustomId('ticket_staff_close')
    .setLabel(cfg.closeButtonLabel || 'Yetkili - Kapat')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(
    applyButtonEmoji(button, cfg.closeButtonEmoji, '🔒')
  );
}

function buildTicketPanelContainer(cfg) {
  const titleText = `## [${cfg.brandName || BRAND_NAME}](https://discord.com)`;

  const ticketPart = [
    `${cfg.ticketAboutEmoji || '✨'} **${cfg.ticketAboutTitle || 'Ticket Sistemi Hakkında'}:**`,
    quoteBlock(cfg.ticketAboutText || 'Aşağıdaki seçeneklerden uygun olanı seçerek hemen bir ticket oluşturabilirsiniz.'),
  ].join('\n');

  const noticePart = [
    `${cfg.ticketNoticeEmoji || '📣'} **${cfg.ticketNoticeTitle || 'Bilgilendirme'}:**`,
    quoteBlock(cfg.ticketNoticeText || 'Sende hemen çok uygun Fiyata kesintisiz hizmetlerimizden yararlan!'),
  ].join('\n');

  const section = {
    type: 9,
    components: [
      {
        type: 10,
        content: `${titleText}\n${ticketPart}\n\n${noticePart}`,
      },
    ],
  };

  if (cfg.panelThumb) {
    section.accessory = {
      type: 11,
      media: { url: cfg.panelThumb },
    };
  }

  const container = {
    type: 17,
    accent_color: 0x3a3c42,
    components: [
      section,
      {
        type: 14,
        divider: true,
        spacing: 1,
      },
      buildTicketCreateRow(cfg).toJSON(),
    ],
  };

  if (cfg.panelImage) {
    container.components.push(
      {
        type: 14,
        divider: true,
        spacing: 1,
      },
      {
        type: 12,
        items: [
          {
            media: { url: cfg.panelImage },
          },
        ],
      }
    );
  }

  container.components.push({
    type: 10,
    content: `-# ${cfg.brandName || BRAND_NAME}`,
  });

  return container;
}

function buildOpenTicketEmbed(interaction, cfg, categoryLabel) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(categoryLabel)
    .setDescription(
      [
        `> ${interaction.user} adlı kişi <t:${timestamp}:R> destek talebi oluşturdu.`,
        '',
        cfg.openTicketLeadText || 'Oluşturulan ticket bilgileri aşağıda belirtilmiştir:',
        '',
        cfg.openTicketReasonText || 'Lütfen ticket açma nedeninizi belirtiniz. Yetkililer en kısa sürede ilgilenecektir.',
      ].join('\n')
    )
    .addFields(
      {
        name: cfg.openTicketUserFieldTitle || 'OLUŞTURAN KULLANICI',
        value: `\`\`\`${interaction.user.username}\`\`\``,
        inline: false,
      },
      {
        name: cfg.openTicketCategoryFieldTitle || 'KATEGORİ',
        value: `\`\`\`${categoryLabel}\`\`\``,
        inline: false,
      }
    );
}

const ticketLabels = {
  satin: 'Satın Alım',
  teknik: 'Teknik Destek',
  partner: 'Partner',
  diger: 'Ekip Başvuru',
};

const commandList = [
  new SlashCommandBuilder()
    .setName('giris-cikis-ayar')
    .setDescription('Giriş / çıkış sistemi ayarları.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addChannelOption(option =>
      option.setName('kanal').setDescription('Mesajların gideceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('arka_plan').setDescription('Giriş / çıkış kartı arka plan görseli').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('giris_emoji').setDescription('Örn: 👋 veya <:giris:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('cikis_emoji').setDescription('Örn: 😢 veya <:cikis:123>').setRequired(false)
    )
    .addStringOption(option => option.setName('sayi_0').setDescription('0 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_1').setDescription('1 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_2').setDescription('2 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_3').setDescription('3 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_4').setDescription('4 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_5').setDescription('5 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_6').setDescription('6 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_7').setDescription('7 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_8').setDescription('8 emojisi').setRequired(false))
    .addStringOption(option => option.setName('sayi_9').setDescription('9 emojisi').setRequired(false)),

  new SlashCommandBuilder()
    .setName('seskanal-ayarla')
    .setDescription('Botun bekleyeceği ses kanalını ayarlar.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addChannelOption(option =>
      option.setName('kanal').setDescription('Ses kanalı').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ticket-ayar')
    .setDescription('Ticket paneli görsel / kanal / emoji ayarları.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addChannelOption(option =>
      option.setName('panel_kanali').setDescription('Panelin gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('kategori').setDescription('Açık ticket kategorisi').addChannelTypes(ChannelType.GuildCategory).setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('kapali_kategori').setDescription('Kapalı ticket kategorisi').addChannelTypes(ChannelType.GuildCategory).setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('destek_rolu').setDescription('Destek rolü').setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('panel_resmi').setDescription('Büyük banner görseli').setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('kucuk_resim').setDescription('Sağ üst küçük logo').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('satin_emoji').setDescription('Örn: <:satin:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('teknik_emoji').setDescription('Örn: <:teknik:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('partner_emoji').setDescription('Örn: <:partner:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('diger_emoji').setDescription('Örn: <:diger:123>').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ticket-metin-ayar')
    .setDescription('Ticket paneli ve açılan ticket yazılarını ayarlar.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(option =>
      option.setName('marka_adi').setDescription('Örn: TrLeaks Bot\'s').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ticket_emoji').setDescription('Örn: ✨ veya <:ticket:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ticket_baslik').setDescription('Örn: Ticket Sistemi Hakkında').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ticket_aciklama').setDescription('İstersen \\n ile alt satır yap').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('bilgi_emoji').setDescription('Örn: 📣 veya <:bilgi:123>').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('bilgi_baslik').setDescription('Örn: Bilgilendirme').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('bilgi_aciklama').setDescription('İstersen \\n ile alt satır yap').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('satin_yazi').setDescription('Örn: Satın Alım').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('teknik_yazi').setDescription('Örn: Teknik Destek').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('partner_yazi').setDescription('Örn: Partner').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('diger_yazi').setDescription('Örn: Diğer Kategoriler').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ticket_bilgi_metni').setDescription('Açılan ticket üst bilgi yazısı').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ticket_neden_metni').setDescription('Açılan ticket açıklama yazısı').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('alan_olusturan').setDescription('Örn: OLUŞTURAN KULLANICI').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('alan_kategori').setDescription('Örn: KATEGORİ').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('kapat_buton_yazi').setDescription('Örn: Yetkili - Kapat').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('kapat_buton_emoji').setDescription('Örn: 🔒 veya <:kilit:123>').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ticketkur')
    .setDescription('Ticket panelini kurar.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('log-kur')
    .setDescription('Sunucuda otomatik log kategorisi ve log kanallarını (rol, mesaj, ses) kurar.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('log-ayar')
    .setDescription('Log kanallarını manuel olarak ayarlar.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addChannelOption(option =>
      option.setName('rol_kanali').setDescription('Rol değişiklik loglarının gideceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('mesaj_kanali').setDescription('Silinen mesaj loglarının gideceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('ses_kanali').setDescription('Ses kanalı hareket loglarının gideceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(false)
    ),
].map(cmd => cmd.toJSON());

async function registerGuildCommands(guild) {
  await guild.commands.set(commandList);
}

async function ensureVoiceConnection(guild) {
  const cfg = getGuildSettings(guild.id);
  if (!cfg.voiceChannelId) return;

  const channel = await guild.channels.fetch(cfg.voiceChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return;

  if (!me.permissionsIn(channel).has(PermissionsBitField.Flags.Connect)) {
    console.log(`[VOICE] ${guild.name} sunucusunda bağlanma izni yok.`);
    return;
  }

  const current = getVoiceConnection(guild.id);
  if (current && current.joinConfig.channelId === channel.id) return;
  if (current) current.destroy();

  try {
    const connection = joinVoiceChannel({
      guildId: guild.id,
      channelId: channel.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      setTimeout(() => ensureVoiceConnection(guild), 5000);
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
    console.log(`[VOICE] ${guild.name} -> ${channel.name} kanalına bağlandı.`);
  } catch (err) {
    console.log(`[VOICE] Bağlanamadı: ${err.message}`);
  }
}

client.once('clientReady', async () => {
  console.log(`${client.user.tag} aktif.`);

  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch().catch(() => null);
      await registerGuildCommands(guild);
      await ensureVoiceConnection(guild);
      console.log(`[SLASH] ${guild.name} komutları yüklendi.`);
    } catch (err) {
      console.log(`[SLASH] ${guild.name} komut yükleme hatası: ${err.message}`);
    }
  }
});

client.on('guildCreate', async guild => {
  try {
    await registerGuildCommands(guild);
  } catch (err) {
    console.log(`[GUILD CREATE] Komut yüklenemedi: ${err.message}`);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  // 1. Botun 7/24 ses kanalı kontrolü
  if (client.user && (oldState.id === client.user.id || newState.id === client.user.id)) {
    const guild = newState.guild || oldState.guild;
    if (guild) {
      const cfg = getGuildSettings(guild.id);
      if (cfg.voiceChannelId) {
        const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        if (me && me.voice.channelId !== cfg.voiceChannelId) {
          setTimeout(() => ensureVoiceConnection(guild), 3000);
        }
      }
    }
    return;
  }

  // 2. Kullanıcı ses hareketleri logu
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const cfg = getGuildSettings(guild.id);
    const voiceLogChanId = cfg.voiceLogChannelId || cfg.auditLogChannelId;
    if (!voiceLogChanId) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const logChannel = await guild.channels.fetch(voiceLogChanId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    // Sese girdi
    if (!oldState.channelId && newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔊 Sese Katıldı')
        .setDescription(`${member} (\`${member.user.tag}\`) adlı kullanıcı **${newState.channel.name}** ses kanalına katıldı.`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
    // Sesten ayrıldı
    else if (oldState.channelId && !newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔇 Sesten Ayrıldı')
        .setDescription(`${member} (\`${member.user.tag}\`) adlı kullanıcı **${oldState.channel.name}** ses kanalından ayrıldı.`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
    // Kanal değiştirdi
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔄 Ses Kanalı Değiştirdi')
        .setDescription(`${member} (\`${member.user.tag}\`) adlı kullanıcı kanal değiştirdi:\n**${oldState.channel.name}** ➔ **${newState.channel.name}**`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    console.error('voiceStateUpdate log hatası:', err);
  }
});

client.on('guildMemberAdd', async member => {
  // 1. Otorol (.gg/lase)
  try {
    let role = member.guild.roles.cache.find(r => r.name.toLowerCase() === '.gg/lase');
    if (!role) {
      role = await member.guild.roles.create({
        name: '.gg/lase',
        color: 0x5865f2,
        reason: 'Otomatik üye rolü (.gg/lase)',
      });
      console.log(`[OTOROL] ${member.guild.name} sunucusunda .gg/lase rolü oluşturuldu.`);
    }
    await member.roles.add(role);
    console.log(`[OTOROL] ${member.user.tag} kullanıcısına .gg/lase rolü verildi.`);
  } catch (err) {
    console.error(`[OTOROL HATA] ${err.message}`);
  }

  // 2. Hoş geldin kartı
  const cfg = getGuildSettings(member.guild.id);
  if (!cfg.logChannelId) return;

  const channel = await member.guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  try {
    const buffer = await buildWelcomeLeaveCard(member, 'join');
    const file = new AttachmentBuilder(buffer, { name: 'hosgeldin.png' });
    const sayi = emojifyNumber(member.guild.memberCount, cfg.digitEmojis);

    await channel.send({
      content: `${cfg.welcomeJoinEmoji || '👋'} ${member} sunucuya katıldı! Seninle birlikte ${sayi} kişi olduk.`,
      files: [file],
    });
  } catch (err) {
    console.log(`[WELCOME] Hata: ${err.message}`);
  }
});

client.on('guildMemberRemove', async member => {
  const cfg = getGuildSettings(member.guild.id);
  if (!cfg.logChannelId) return;

  const channel = await member.guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  try {
    const buffer = await buildWelcomeLeaveCard(member, 'leave');
    const file = new AttachmentBuilder(buffer, { name: 'ayrilis.png' });
    const sayi = emojifyNumber(member.guild.memberCount, cfg.digitEmojis);

    await channel.send({
      content: `${cfg.welcomeLeaveEmoji || '😢'} **${member.user.tag}** sunucudan ayrıldı. Sunucuda ${sayi} kişi kaldı.`,
      files: [file],
    });
  } catch (err) {
    console.log(`[LEAVE] Hata: ${err.message}`);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const guild = newMember.guild;
    const cfg = getGuildSettings(guild.id);
    const targetChannelId = cfg.roleLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId) return;

    const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    // Discord denetim kaydının (audit log) oluşması için kısa bir bekleme
    await new Promise(r => setTimeout(r, 650));

    // Audit Log üzerinden son rol güncellemesini kontrol et
    let executor = null;
    let reason = null;
    let auditAddedRoles = [];
    let auditRemovedRoles = [];

    try {
      const logs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberRoleUpdate,
      });
      const entry = logs.entries.first();
      if (
        entry &&
        entry.target?.id === newMember.id &&
        Date.now() - entry.createdTimestamp < 20000
      ) {
        executor = entry.executor;
        reason = entry.reason;

        for (const change of entry.changes || []) {
          if (change.key === '$add' && Array.isArray(change.new)) {
            auditAddedRoles.push(...change.new.map(r => `<@&${r.id}> (\`${r.name}\`)`));
          }
          if (change.key === '$remove' && Array.isArray(change.new)) {
            auditRemovedRoles.push(...change.new.map(r => `<@&${r.id}> (\`${r.name}\`)`));
          }
        }
      }
    } catch (e) {
      console.error('Audit log fetch error:', e.message);
    }

    // Cache üzerinden rol kontrolü
    const cacheAdded = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const cacheRemoved = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    const finalAdded = cacheAdded.size > 0
      ? cacheAdded.map(r => `${r} (\`${r.name}\`)`)
      : auditAddedRoles;

    const finalRemoved = cacheRemoved.size > 0
      ? cacheRemoved.map(r => `${r} (\`${r.name}\`)`)
      : auditRemovedRoles;

    if (finalAdded.length === 0 && finalRemoved.length === 0) return;

    const isAdd = finalAdded.length > 0;
    const isRemove = finalRemoved.length > 0;

    let title = '🛡️ Rol Güncellendi';
    let color = 0x5865f2;
    if (isAdd && !isRemove) {
      title = '➕ Rol Verildi';
      color = 0x57f287; // Yeşil
    } else if (isRemove && !isAdd) {
      title = '➖ Rol Alındı';
      color = 0xed4245; // Kırmızı
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setThumbnail(newMember.user.displayAvatarURL({ forceStatic: false }))
      .addFields(
        {
          name: '👤 Kullanıcı',
          value: `${newMember} (\`${newMember.user.tag}\` - \`${newMember.id}\`)`,
          inline: false,
        },
        {
          name: '👮 İşlemi Yapan Yetkili',
          value: executor ? `${executor} (\`${executor.tag}\` - \`${executor.id}\`)` : '*Otomatik veya Bilinmiyor*',
          inline: false,
        }
      )
      .setTimestamp();

    if (finalAdded.length > 0) {
      embed.addFields({
        name: '➕ Eklenen Roller',
        value: finalAdded.join(', '),
        inline: false,
      });
    }

    if (finalRemoved.length > 0) {
      embed.addFields({
        name: '➖ Alınan Roller',
        value: finalRemoved.join(', '),
        inline: false,
      });
    }

    if (reason) {
      embed.addFields({ name: '📝 Sebep', value: reason, inline: false });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('guildMemberUpdate log error:', err);
  }
});

client.on('messageCreate', async message => {
  try {
    if (!message.guild || message.author.bot) return;
    const cfg = getGuildSettings(message.guild.id);
    const targetChannelId = cfg.messageLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId) return;

    // Log kanallarında yazılan mesajları tekrar loglamasın (sonsuz döngü engeli)
    if (
      message.channel.id === targetChannelId ||
      message.channel.id === cfg.roleLogChannelId ||
      message.channel.id === cfg.voiceLogChannelId ||
      message.channel.id === cfg.logChannelId
    ) {
      return;
    }

    const channel = await message.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('💬 Yeni Mesaj Gönderildi')
      .setThumbnail(message.author.displayAvatarURL({ forceStatic: false }))
      .addFields(
        {
          name: '👤 Gönderen',
          value: `${message.author} (\`${message.author.tag}\`)`,
          inline: true,
        },
        {
          name: '💬 Kanal',
          value: `${message.channel}`,
          inline: true,
        },
        {
          name: '🔗 Mesaj Linki',
          value: `[Mesaja Git](${message.url})`,
          inline: true,
        }
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({
        name: '📄 Mesaj İçeriği',
        value: message.content.slice(0, 1024),
        inline: false,
      });
    }

    if (message.attachments.size > 0) {
      embed.addFields({
        name: '📎 Eklenen Dosyalar',
        value: message.attachments.map(a => `[${a.name || 'Ek'}](${a.url})`).join('\n').slice(0, 1024),
        inline: false,
      });
    }

    await channel.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error('messageCreate log error:', err);
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Embed önizlemeleri değiştiğinde tetiklenmesin

    const cfg = getGuildSettings(newMessage.guild.id);
    const targetChannelId = cfg.messageLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId || newMessage.channel.id === targetChannelId) return;

    const channel = await newMessage.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('✏️ Mesaj Düzenlendi')
      .setThumbnail(newMessage.author.displayAvatarURL({ forceStatic: false }))
      .addFields(
        {
          name: '👤 Mesaj Sahibi',
          value: `${newMessage.author} (\`${newMessage.author.tag}\`)`,
          inline: true,
        },
        {
          name: '💬 Kanal',
          value: `${newMessage.channel}`,
          inline: true,
        },
        {
          name: '🔗 Mesaj Linki',
          value: `[Mesaja Git](${newMessage.url})`,
          inline: true,
        },
        {
          name: '📄 Eski Mesaj',
          value: oldMessage.content ? oldMessage.content.slice(0, 1024) : '*Önbellekte yok veya görsel*',
          inline: false,
        },
        {
          name: '📝 Yeni Mesaj',
          value: newMessage.content ? newMessage.content.slice(0, 1024) : '*İçerik yok*',
          inline: false,
        }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error('messageUpdate log error:', err);
  }
});

client.on('messageDelete', async message => {
  try {
    if (!message.guild || message.author?.bot) return;
    const cfg = getGuildSettings(message.guild.id);
    const targetChannelId = cfg.messageLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId) return;

    const channel = await message.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    await new Promise(r => setTimeout(r, 650));
    let executor = null;
    try {
      const logs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete,
      });
      const entry = logs.entries.first();
      if (
        entry &&
        entry.target?.id === message.author?.id &&
        entry.extra?.channel?.id === message.channel.id &&
        Date.now() - entry.createdTimestamp < 15000
      ) {
        executor = entry.executor;
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🗑️ Mesaj Silindi')
      .addFields(
        {
          name: '👤 Mesaj Sahibi',
          value: message.author ? `${message.author} (\`${message.author.tag}\`)` : '*Bilinmiyor*',
          inline: true,
        },
        {
          name: '💬 Kanal',
          value: `${message.channel}`,
          inline: true,
        }
      )
      .setTimestamp();

    if (executor && executor.id !== message.author?.id) {
      embed.addFields({
        name: '👮 Silen Yetkili',
        value: `${executor} (\`${executor.tag}\`)`,
        inline: true,
      });
    }

    if (message.content) {
      embed.addFields({
        name: '📄 Mesaj İçeriği',
        value: message.content.slice(0, 1024),
        inline: false,
      });
    }

    if (message.attachments.size > 0) {
      embed.addFields({
        name: '📎 Ekler',
        value: message.attachments.map(a => a.name || a.url).join('\n').slice(0, 1024),
        inline: false,
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('messageDelete log error:', err);
  }
});

client.on('guildBanAdd', async ban => {
  try {
    const cfg = getGuildSettings(ban.guild.id);
    const targetChannelId = cfg.roleLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId) return;

    const channel = await ban.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    await new Promise(r => setTimeout(r, 650));
    let executor = null;
    let reason = ban.reason;
    try {
      const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
      const entry = logs.entries.first();
      if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 15000) {
        executor = entry.executor;
        if (!reason) reason = entry.reason;
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔨 Kullanıcı Yasaklandı (Ban)')
      .addFields(
        { name: '👤 Yasaklanan', value: `${ban.user} (\`${ban.user.tag}\` - \`${ban.user.id}\`)`, inline: false },
        { name: '👮 Yasaklayan Yetkili', value: executor ? `${executor} (\`${executor.tag}\`)` : '*Bilinmiyor*', inline: false },
        { name: '📝 Sebep', value: reason || '*Belirtilmedi*', inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('guildBanAdd error:', err);
  }
});

client.on('guildBanRemove', async ban => {
  try {
    const cfg = getGuildSettings(ban.guild.id);
    const targetChannelId = cfg.roleLogChannelId || cfg.auditLogChannelId;
    if (!targetChannelId) return;

    const channel = await ban.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    await new Promise(r => setTimeout(r, 650));
    let executor = null;
    try {
      const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanRemove });
      const entry = logs.entries.first();
      if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 15000) {
        executor = entry.executor;
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🔓 Yasak Kaldırıldı (Unban)')
      .addFields(
        { name: '👤 Kullanıcı', value: `${ban.user} (\`${ban.user.tag}\` - \`${ban.user.id}\`)`, inline: false },
        { name: '👮 Yasağı Kaldıran', value: executor ? `${executor} (\`${executor.tag}\`)` : '*Bilinmiyor*', inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('guildBanRemove error:', err);
  }
});

client.on('channelDelete', channel => {
  deleteTicket(channel.id);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.inGuild()) return;

  try {
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ flags: EPHEMERAL });

      const current = getGuildSettings(interaction.guild.id);

      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply({
          content: '❌ Bu komutu kullanmak için yönetici olmalısın.',
        });
      }

      if (interaction.commandName === 'giris-cikis-ayar') {
        const kanal = interaction.options.getChannel('kanal');
        const arkaPlan = interaction.options.getAttachment('arka_plan');
        const girisEmoji = interaction.options.getString('giris_emoji');
        const cikisEmoji = interaction.options.getString('cikis_emoji');

        const sayi0 = interaction.options.getString('sayi_0');
        const sayi1 = interaction.options.getString('sayi_1');
        const sayi2 = interaction.options.getString('sayi_2');
        const sayi3 = interaction.options.getString('sayi_3');
        const sayi4 = interaction.options.getString('sayi_4');
        const sayi5 = interaction.options.getString('sayi_5');
        const sayi6 = interaction.options.getString('sayi_6');
        const sayi7 = interaction.options.getString('sayi_7');
        const sayi8 = interaction.options.getString('sayi_8');
        const sayi9 = interaction.options.getString('sayi_9');

        const nothingProvided =
          !kanal &&
          !arkaPlan &&
          girisEmoji == null &&
          cikisEmoji == null &&
          sayi0 == null &&
          sayi1 == null &&
          sayi2 == null &&
          sayi3 == null &&
          sayi4 == null &&
          sayi5 == null &&
          sayi6 == null &&
          sayi7 == null &&
          sayi8 == null &&
          sayi9 == null;

        if (nothingProvided) {
          return interaction.editReply({
            content: '❌ En az bir alan doldur.',
          });
        }

        if (arkaPlan && !isImageAttachment(arkaPlan)) {
          return interaction.editReply({
            content: '❌ arka_plan bir görsel dosyası olmalı.',
          });
        }

        const updated = setGuildSettings(interaction.guild.id, {
          logChannelId: kanal?.id ?? current.logChannelId,
          welcomeBackground: arkaPlan?.url ?? current.welcomeBackground,
          welcomeJoinEmoji: girisEmoji ?? current.welcomeJoinEmoji,
          welcomeLeaveEmoji: cikisEmoji ?? current.welcomeLeaveEmoji,
          digitEmojis: {
            '0': sayi0 ?? current.digitEmojis?.['0'] ?? DEFAULT_DIGITS['0'],
            '1': sayi1 ?? current.digitEmojis?.['1'] ?? DEFAULT_DIGITS['1'],
            '2': sayi2 ?? current.digitEmojis?.['2'] ?? DEFAULT_DIGITS['2'],
            '3': sayi3 ?? current.digitEmojis?.['3'] ?? DEFAULT_DIGITS['3'],
            '4': sayi4 ?? current.digitEmojis?.['4'] ?? DEFAULT_DIGITS['4'],
            '5': sayi5 ?? current.digitEmojis?.['5'] ?? DEFAULT_DIGITS['5'],
            '6': sayi6 ?? current.digitEmojis?.['6'] ?? DEFAULT_DIGITS['6'],
            '7': sayi7 ?? current.digitEmojis?.['7'] ?? DEFAULT_DIGITS['7'],
            '8': sayi8 ?? current.digitEmojis?.['8'] ?? DEFAULT_DIGITS['8'],
            '9': sayi9 ?? current.digitEmojis?.['9'] ?? DEFAULT_DIGITS['9'],
          },
        });

        return interaction.editReply({
          content:
            `✅ Giriş / çıkış ayarları kaydedildi.\n` +
            `Kanal: ${updated.logChannelId ? `<#${updated.logChannelId}>` : 'Ayarlanmadı'}\n` +
            `Giriş Emoji: ${updated.welcomeJoinEmoji}\n` +
            `Çıkış Emoji: ${updated.welcomeLeaveEmoji}\n` +
            `Sayı Önizleme: ${emojifyNumber(interaction.guild.memberCount, updated.digitEmojis)}`,
        });
      }

      if (interaction.commandName === 'seskanal-ayarla') {
        const kanal = interaction.options.getChannel('kanal', true);

        setGuildSettings(interaction.guild.id, {
          voiceChannelId: kanal.id,
        });

        ensureVoiceConnection(interaction.guild).catch(console.error);

        return interaction.editReply({
          content: `✅ Bot artık ${kanal} kanalında bekleyecek.`,
        });
      }

      if (interaction.commandName === 'ticket-ayar') {
        const panelKanali = interaction.options.getChannel('panel_kanali');
        const kategori = interaction.options.getChannel('kategori');
        const kapaliKategori = interaction.options.getChannel('kapali_kategori');
        const destekRolu = interaction.options.getRole('destek_rolu');

        const panelResmi = interaction.options.getAttachment('panel_resmi');
        const kucukResim = interaction.options.getAttachment('kucuk_resim');

        const satinEmoji = interaction.options.getString('satin_emoji');
        const teknikEmoji = interaction.options.getString('teknik_emoji');
        const partnerEmoji = interaction.options.getString('partner_emoji');
        const digerEmoji = interaction.options.getString('diger_emoji');

        const nothingProvided =
          !panelKanali &&
          !kategori &&
          !kapaliKategori &&
          !destekRolu &&
          !panelResmi &&
          !kucukResim &&
          satinEmoji == null &&
          teknikEmoji == null &&
          partnerEmoji == null &&
          digerEmoji == null;

        if (nothingProvided) {
          return interaction.editReply({
            content: '❌ En az bir alan doldur.',
          });
        }

        if (panelResmi && !isImageAttachment(panelResmi)) {
          return interaction.editReply({
            content: '❌ panel_resmi bir görsel olmalı.',
          });
        }

        if (kucukResim && !isImageAttachment(kucukResim)) {
          return interaction.editReply({
            content: '❌ kucuk_resim bir görsel olmalı.',
          });
        }

        if (satinEmoji && !parseEmojiInput(satinEmoji)) {
          return interaction.editReply({ content: '❌ satin_emoji hatalı.' });
        }

        if (teknikEmoji && !parseEmojiInput(teknikEmoji)) {
          return interaction.editReply({ content: '❌ teknik_emoji hatalı.' });
        }

        if (partnerEmoji && !parseEmojiInput(partnerEmoji)) {
          return interaction.editReply({ content: '❌ partner_emoji hatalı.' });
        }

        if (digerEmoji && !parseEmojiInput(digerEmoji)) {
          return interaction.editReply({ content: '❌ diger_emoji hatalı.' });
        }

        const updated = setGuildSettings(interaction.guild.id, {
          ticketPanelChannelId: panelKanali?.id ?? current.ticketPanelChannelId,
          ticketCategoryId: kategori?.id ?? current.ticketCategoryId,
          ticketClosedCategoryId: kapaliKategori?.id ?? current.ticketClosedCategoryId,
          supportRoleId: destekRolu?.id ?? current.supportRoleId,
          panelImage: panelResmi?.url ?? current.panelImage,
          panelThumb: kucukResim?.url ?? current.panelThumb,
          buttonEmojis: {
            satin: satinEmoji ?? current.buttonEmojis?.satin ?? DEFAULT_BUTTONS.satin.emoji,
            teknik: teknikEmoji ?? current.buttonEmojis?.teknik ?? DEFAULT_BUTTONS.teknik.emoji,
            partner: partnerEmoji ?? current.buttonEmojis?.partner ?? DEFAULT_BUTTONS.partner.emoji,
            diger: digerEmoji ?? current.buttonEmojis?.diger ?? DEFAULT_BUTTONS.diger.emoji,
          },
        });

        return interaction.editReply({
          content:
            `✅ Ticket ayarları kaydedildi.\n` +
            `Panel Kanalı: ${updated.ticketPanelChannelId ? `<#${updated.ticketPanelChannelId}>` : 'Ayarlanmadı'}\n` +
            `Açık Kategori: ${updated.ticketCategoryId ? `<#${updated.ticketCategoryId}>` : 'Ayarlanmadı'}\n` +
            `Kapalı Kategori: ${updated.ticketClosedCategoryId ? `<#${updated.ticketClosedCategoryId}>` : 'Ayarlanmadı'}\n` +
            `Destek Rolü: ${updated.supportRoleId ? `<@&${updated.supportRoleId}>` : 'Ayarlanmadı'}\n` +
            `Satın Alım Emoji: ${updated.buttonEmojis.satin}\n` +
            `Teknik Emoji: ${updated.buttonEmojis.teknik}\n` +
            `Partner Emoji: ${updated.buttonEmojis.partner}\n` +
            `Diğer Emoji: ${updated.buttonEmojis.diger}`,
        });
      }

      if (interaction.commandName === 'ticket-metin-ayar') {
        const markaAdi = interaction.options.getString('marka_adi');
        const ticketEmoji = interaction.options.getString('ticket_emoji');
        const ticketBaslik = interaction.options.getString('ticket_baslik');
        const ticketAciklama = interaction.options.getString('ticket_aciklama');
        const bilgiEmoji = interaction.options.getString('bilgi_emoji');
        const bilgiBaslik = interaction.options.getString('bilgi_baslik');
        const bilgiAciklama = interaction.options.getString('bilgi_aciklama');

        const satinYazi = interaction.options.getString('satin_yazi');
        const teknikYazi = interaction.options.getString('teknik_yazi');
        const partnerYazi = interaction.options.getString('partner_yazi');
        const digerYazi = interaction.options.getString('diger_yazi');

        const ticketBilgiMetni = interaction.options.getString('ticket_bilgi_metni');
        const ticketNedenMetni = interaction.options.getString('ticket_neden_metni');
        const alanOlusturan = interaction.options.getString('alan_olusturan');
        const alanKategori = interaction.options.getString('alan_kategori');
        const kapatButonYazi = interaction.options.getString('kapat_buton_yazi');
        const kapatButonEmoji = interaction.options.getString('kapat_buton_emoji');

        const nothingProvided =
          markaAdi == null &&
          ticketEmoji == null &&
          ticketBaslik == null &&
          ticketAciklama == null &&
          bilgiEmoji == null &&
          bilgiBaslik == null &&
          bilgiAciklama == null &&
          satinYazi == null &&
          teknikYazi == null &&
          partnerYazi == null &&
          digerYazi == null &&
          ticketBilgiMetni == null &&
          ticketNedenMetni == null &&
          alanOlusturan == null &&
          alanKategori == null &&
          kapatButonYazi == null &&
          kapatButonEmoji == null;

        if (nothingProvided) {
          return interaction.editReply({
            content: '❌ En az bir alan doldur.',
          });
        }

        if (ticketEmoji && !parseEmojiInput(ticketEmoji)) {
          return interaction.editReply({ content: '❌ ticket_emoji hatalı.' });
        }

        if (bilgiEmoji && !parseEmojiInput(bilgiEmoji)) {
          return interaction.editReply({ content: '❌ bilgi_emoji hatalı.' });
        }

        if (kapatButonEmoji && !parseEmojiInput(kapatButonEmoji)) {
          return interaction.editReply({ content: '❌ kapat_buton_emoji hatalı.' });
        }

        const updated = setGuildSettings(interaction.guild.id, {
          brandName: markaAdi ?? current.brandName,
          ticketAboutEmoji: ticketEmoji ?? current.ticketAboutEmoji,
          ticketAboutTitle: ticketBaslik ?? current.ticketAboutTitle,
          ticketAboutText: normalizeMultiline(ticketAciklama ?? current.ticketAboutText),
          ticketNoticeEmoji: bilgiEmoji ?? current.ticketNoticeEmoji,
          ticketNoticeTitle: bilgiBaslik ?? current.ticketNoticeTitle,
          ticketNoticeText: normalizeMultiline(bilgiAciklama ?? current.ticketNoticeText),
          buttonLabels: {
            satin: satinYazi ?? current.buttonLabels?.satin ?? DEFAULT_BUTTONS.satin.label,
            teknik: teknikYazi ?? current.buttonLabels?.teknik ?? DEFAULT_BUTTONS.teknik.label,
            partner: partnerYazi ?? current.buttonLabels?.partner ?? DEFAULT_BUTTONS.partner.label,
            diger: digerYazi ?? current.buttonLabels?.diger ?? DEFAULT_BUTTONS.diger.label,
          },
          openTicketLeadText: normalizeMultiline(ticketBilgiMetni ?? current.openTicketLeadText),
          openTicketReasonText: normalizeMultiline(ticketNedenMetni ?? current.openTicketReasonText),
          openTicketUserFieldTitle: alanOlusturan ?? current.openTicketUserFieldTitle,
          openTicketCategoryFieldTitle: alanKategori ?? current.openTicketCategoryFieldTitle,
          closeButtonLabel: kapatButonYazi ?? current.closeButtonLabel,
          closeButtonEmoji: kapatButonEmoji ?? current.closeButtonEmoji,
        });

        return interaction.editReply({
          content:
            `✅ Ticket metin ayarları kaydedildi.\n` +
            `Marka Adı: ${updated.brandName}\n` +
            `Ticket Emoji: ${updated.ticketAboutEmoji}\n` +
            `Ticket Başlık: ${updated.ticketAboutTitle}\n` +
            `Ticket Açıklama: ${updated.ticketAboutText}\n` +
            `Bilgi Emoji: ${updated.ticketNoticeEmoji}\n` +
            `Bilgi Başlık: ${updated.ticketNoticeTitle}\n` +
            `Bilgi Açıklama: ${updated.ticketNoticeText}\n` +
            `Açılan Ticket Üst Metni: ${updated.openTicketLeadText}\n` +
            `Açılan Ticket Açıklama: ${updated.openTicketReasonText}\n` +
            `Alanlar: ${updated.openTicketUserFieldTitle} | ${updated.openTicketCategoryFieldTitle}\n` +
            `Kapat Butonu: ${updated.closeButtonLabel} ${updated.closeButtonEmoji}\n` +
            `Butonlar: ${updated.buttonLabels.satin} | ${updated.buttonLabels.teknik} | ${updated.buttonLabels.partner} | ${updated.buttonLabels.diger}`,
        });
      }

      if (interaction.commandName === 'ticketkur') {
        const guild = interaction.guild;
        let cfg = getGuildSettings(guild.id);

        // 1. Panel kanalı: Eğer ayarlanmadıysa komutun yazıldığı kanalı kullan
        let panelChannel = cfg.ticketPanelChannelId
          ? await guild.channels.fetch(cfg.ticketPanelChannelId).catch(() => null)
          : null;
        if (!panelChannel || !panelChannel.isTextBased()) {
          panelChannel = interaction.channel;
          cfg = setGuildSettings(guild.id, { ticketPanelChannelId: panelChannel.id });
        }

        // 2. Kategori: Eğer ayarlanmadıysa, mevcut kanalın kategorisini al veya '📩・TİCKETLAR' kategorisi bul/oluştur
        let ticketCategory = cfg.ticketCategoryId
          ? await guild.channels.fetch(cfg.ticketCategoryId).catch(() => null)
          : null;
        if (!ticketCategory) {
          if (panelChannel.parentId) {
            ticketCategory = await guild.channels.fetch(panelChannel.parentId).catch(() => null);
          }
          if (!ticketCategory) {
            ticketCategory =
              guild.channels.cache.find(
                c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
              ) ||
              (await guild.channels.create({
                name: '📩・TİCKETLAR',
                type: ChannelType.GuildCategory,
              }));
          }
          cfg = setGuildSettings(guild.id, {
            ticketCategoryId: ticketCategory.id,
            ticketClosedCategoryId: ticketCategory.id,
          });
        }

        // 3. Destek rolü: Eğer ayarlanmadıysa yetkili/destek rolü bul veya otomatik oluştur
        let supportRole = cfg.supportRoleId
          ? await guild.roles.fetch(cfg.supportRoleId).catch(() => null)
          : null;
        if (!supportRole) {
          supportRole =
            guild.roles.cache.find(r =>
              ['destek', 'yetkili', 'staff', 'mod', 'admin'].some(n =>
                r.name.toLowerCase().includes(n)
              )
            ) ||
            (interaction.member.roles.highest && interaction.member.roles.highest.id !== guild.roles.everyone.id
              ? interaction.member.roles.highest
              : null) ||
            (await guild.roles.create({
              name: '🛡️・Destek Ekibi',
              color: 0x5865f2,
              reason: 'Ticket sistemi için otomatik oluşturuldu',
            }));
          cfg = setGuildSettings(guild.id, { supportRoleId: supportRole.id });
        }

        const logoPath = path.join(__dirname, 'assets', 'lase_logo.png');
        const hasLogo = fs.existsSync(logoPath);
        const files = [];
        if (hasLogo && !cfg.panelThumb) {
          cfg.panelThumb = 'attachment://lase_logo.png';
        }
        if (hasLogo && (cfg.panelThumb?.startsWith('attachment://') || cfg.panelImage?.startsWith('attachment://'))) {
          files.push(new AttachmentBuilder(logoPath, { name: 'lase_logo.png' }));
        }

        // Paneli gönder (Components V2 ve standart Embed yedekli)
        try {
          const payload = {
            flags: COMPONENTS_V2_FLAG,
            components: [buildTicketPanelContainer(cfg)],
          };
          if (files.length > 0) payload.files = files;
          await panelChannel.send(payload);
        } catch (err) {
          console.error('Components V2 panel send failed, falling back to Embed:', err);
          const embed = new EmbedBuilder()
            .setColor(0x3a3c42)
            .setTitle(cfg.brandName || BRAND_NAME)
            .setDescription(
              `${cfg.ticketAboutEmoji || '✨'} **${cfg.ticketAboutTitle || 'Ticket Sistemi Hakkında'}:**\n> ${cfg.ticketAboutText || 'Aşağıdaki seçeneklerden uygun olanı seçerek hemen bir ticket oluşturabilirsiniz.'}\n\n${cfg.ticketNoticeEmoji || '📣'} **${cfg.ticketNoticeTitle || 'Bilgilendirme'}:**\n> ${cfg.ticketNoticeText || 'Sende hemen çok uygun fiyata kesintisiz hizmetlerimizden yararlan!'}`
            );
          if (cfg.panelImage) embed.setImage(cfg.panelImage);
          if (cfg.panelThumb) embed.setThumbnail(cfg.panelThumb);
          await panelChannel.send({
            embeds: [embed],
            components: [buildTicketCreateRow(cfg)],
            files: files.length > 0 ? [new AttachmentBuilder(logoPath, { name: 'lase_logo.png' })] : [],
          });
        }

        return interaction.editReply({
          content: `✅ Ticket paneli ${panelChannel} kanalına başarıyla gönderildi!\n*(Kategori: **${ticketCategory.name}** | Destek Rolü: **${supportRole.name}**)*`,
        });
      }

      if (interaction.commandName === 'log-kur') {
        const guild = interaction.guild;
        let cfg = getGuildSettings(guild.id);

        // 1. Kategori oluştur veya bul (📜・LOGLAR)
        let logCat = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('log')
        );
        if (!logCat) {
          const overwrites = [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks,
              ],
            },
          ];
          if (cfg.supportRoleId && guild.roles.cache.has(cfg.supportRoleId)) {
            overwrites.push({
              id: cfg.supportRoleId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.ReadMessageHistory,
              ],
            });
          }
          logCat = await guild.channels.create({
            name: '📜・LOGLAR',
            type: ChannelType.GuildCategory,
            permissionOverwrites: overwrites,
          });
        }

        // 2. Rol log kanalı
        let roleChan = cfg.roleLogChannelId ? await guild.channels.fetch(cfg.roleLogChannelId).catch(() => null) : null;
        if (!roleChan) {
          roleChan = guild.channels.cache.find(c => c.parentId === logCat.id && c.name.includes('rol')) ||
            await guild.channels.create({
              name: '🛡️・rol-log',
              type: ChannelType.GuildText,
              parent: logCat.id,
            });
        }

        // 3. Mesaj log kanalı
        let msgChan = cfg.messageLogChannelId ? await guild.channels.fetch(cfg.messageLogChannelId).catch(() => null) : null;
        if (!msgChan) {
          msgChan = guild.channels.cache.find(c => c.parentId === logCat.id && c.name.includes('mesaj')) ||
            await guild.channels.create({
              name: '🗑️・mesaj-log',
              type: ChannelType.GuildText,
              parent: logCat.id,
            });
        }

        // 4. Ses log kanalı
        let voiceChan = cfg.voiceLogChannelId ? await guild.channels.fetch(cfg.voiceLogChannelId).catch(() => null) : null;
        if (!voiceChan) {
          voiceChan = guild.channels.cache.find(c => c.parentId === logCat.id && c.name.includes('ses')) ||
            await guild.channels.create({
              name: '🔊・ses-log',
              type: ChannelType.GuildText,
              parent: logCat.id,
            });
        }

        // Ayarları kaydet
        setGuildSettings(guild.id, {
          roleLogChannelId: roleChan.id,
          messageLogChannelId: msgChan.id,
          voiceLogChannelId: voiceChan.id,
        });

        return interaction.editReply({
          content: `✅ **Loglama sistemi başarıyla kuruldu!**\n\n📁 **Kategori:** ${logCat.name}\n🛡️ **Rol Log:** ${roleChan}\n🗑️ **Mesaj Log:** ${msgChan}\n🔊 **Ses Log:** ${voiceChan}\n\n*Tüm kanallar yalnızca yetkililere özel olarak ayarlandı. Artık kimin kime hangi rolü verdiği, silinen mesajlar ve ses hareketleri anlık olarak kaydedilecek.*`,
        });
      }

      if (interaction.commandName === 'log-ayar') {
        const rolK = interaction.options.getChannel('rol_kanali');
        const msgK = interaction.options.getChannel('mesaj_kanali');
        const sesK = interaction.options.getChannel('ses_kanali');

        if (!rolK && !msgK && !sesK) {
          return interaction.editReply({ content: '❌ En az bir log kanalı belirtmelisin.' });
        }

        const patch = {};
        if (rolK) patch.roleLogChannelId = rolK.id;
        if (msgK) patch.messageLogChannelId = msgK.id;
        if (sesK) patch.voiceLogChannelId = sesK.id;

        const updated = setGuildSettings(interaction.guild.id, patch);

        return interaction.editReply({
          content: `✅ **Log kanalları güncellendi!**\n` +
            `🛡️ Rol Log: ${updated.roleLogChannelId ? `<#${updated.roleLogChannelId}>` : 'Ayarlanmadı'}\n` +
            `🗑️ Mesaj Log: ${updated.messageLogChannelId ? `<#${updated.messageLogChannelId}>` : 'Ayarlanmadı'}\n` +
            `🔊 Ses Log: ${updated.voiceLogChannelId ? `<#${updated.voiceLogChannelId}>` : 'Ayarlanmadı'}`,
        });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('create_ticket_')) {
      await interaction.deferReply({ flags: EPHEMERAL });

      let cfg = getGuildSettings(interaction.guild.id);

      // Kategori ve destek rolü eksikse otomatik ayarla
      if (!cfg.ticketCategoryId) {
        let cat = interaction.channel.parentId
          ? await interaction.guild.channels.fetch(interaction.channel.parentId).catch(() => null)
          : null;
        if (!cat) {
          cat =
            interaction.guild.channels.cache.find(
              c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
            ) ||
            (await interaction.guild.channels.create({
              name: '📩・TİCKETLAR',
              type: ChannelType.GuildCategory,
            }));
        }
        cfg = setGuildSettings(interaction.guild.id, {
          ticketCategoryId: cat.id,
          ticketClosedCategoryId: cat.id,
        });
      }

      const existingChannelId = await findExistingOpenTicketChannel(
        interaction.guild,
        interaction.user.id
      );

      if (existingChannelId) {
        return interaction.editReply({
          content: `❌ Zaten açık bir ticketin var: <#${existingChannelId}>`,
        });
      }

      const ticketType = interaction.customId.replace('create_ticket_', '');
      const labels = cfg.buttonLabels || defaultGuildSettings().buttonLabels;
      const categoryLabel = labels[ticketType] || ticketLabels[ticketType] || 'Ticket';
      const baseName = `${slugify(categoryLabel)}-${slugify(interaction.user.username)}`;

      const permissionOverwrites = [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ];

      if (cfg.supportRoleId && interaction.guild.roles.cache.has(cfg.supportRoleId)) {
        permissionOverwrites.push({
          id: cfg.supportRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        });
      }

      const created = await interaction.guild.channels.create({
        name: baseName.slice(0, 100),
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        topic: `ticket-owner:${interaction.user.id} | type:${ticketType}`,
        permissionOverwrites,
      });

      setTicket(created.id, {
        guildId: interaction.guild.id,
        ownerId: interaction.user.id,
        type: ticketType,
        status: 'open',
        baseName,
      });

      await created.send({
        embeds: [buildOpenTicketEmbed(interaction, cfg, categoryLabel)],
        components: [buildTicketOpenRow(cfg)],
      });

      return interaction.editReply({
        content: `✅ Ticket oluşturuldu: ${created}`,
      });
    }

    if (interaction.isButton()) {
      if (interaction.customId !== 'ticket_staff_close') return;

      const cfg = getGuildSettings(interaction.guild.id);
      const ticket = getTicket(interaction.channelId);

      if (!ticket) {
        return interaction.reply({
          content: '❌ Bu kanal için ticket verisi bulunamadı.',
          flags: EPHEMERAL,
        });
      }

      await interaction.deferReply({ flags: EPHEMERAL });
      const member = await getMemberFromInteraction(interaction);

      if (!hasStaffPerm(member, cfg)) {
        return interaction.editReply({
          content: '❌ Bu butonu sadece yetkililer kullanabilir.',
        });
      }

      if (ticket.status === 'closed') {
        return interaction.editReply({
          content: '❌ Ticket zaten kapalı.',
        });
      }

      deleteTicket(interaction.channelId);

      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🗑️ Ticket Kapatıldı')
            .setDescription(`Bu ticket ${interaction.user} tarafından kapatıldı.\nKanal **3 saniye içinde siliniyor...**`),
        ],
      });

      setTimeout(async () => {
        await interaction.channel.delete('Ticket kapatıldı ve silindi.').catch(() => null);
      }, 3000);

      return interaction.editReply({
        content: '✅ Ticket kapatıldı, kanal siliniyor.',
      });
    }
  } catch (err) {
    console.error('INTERACTION HATASI:', err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Bir hata oluştu. Konsolu kontrol et.',
      }).catch(() => null);
    } else {
      await interaction.reply({
        content: '❌ Bir hata oluştu. Konsolu kontrol et.',
        flags: EPHEMERAL,
      }).catch(() => null);
    }
  }
});

client.login(process.env.TOKEN);