import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_FEE_SETTINGS, computeServiceFee, rentDue, isValidPromptPayId, promptPayQrDataUrl } from './payment-helpers.js';
import './animations.js';
import { ADDRESS_FIELDS, formatThaiAddress, parseThaiAddress, geocodeFreeTextAddress } from './address-geocode.js';
import { createMeetingPointPicker, createRouteMap, getCurrentPosition, googleMapsDirectionsUrl, formatDistance, formatDuration, toPoint, isPoint } from './meeting-map.js';
let activeModalMap = null;

// Add your Supabase project URL and anon/publishable key to .env.local.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
const liveMode = Boolean(supabase);
let currentSession = null;
let currentProfile = null;
let currentIsAdmin = false;
let listingCache = [];
let accountTab = 'my-listings';
let authGeneration = 0;
let authSubscription = null;
let realtimeChannels = [];
let activeConversation = null;
let conversationChannel = null;
let conversationRecoveryTimer = null;
const chatSignedUrlCache = new Map();
let notificationRecoveryTimer = null;
let notificationCache = [];
let notificationOffset = 0;
let chatShareChoices = [];
const NOTIFICATION_PAGE_SIZE = 50;
let listingMap = null;
let listingMarkers = [];
let mapMode = false;
let locationPickerMap = null;
let locationPickerMarker = null;
const THAILAND_BOUNDS = [[5.6, 97.3], [20.5, 105.7]];
const LISTING_IMAGE_BUCKET = 'listing-images';
const CHAT_IMAGE_BUCKET = 'conversation-images';
const PAYMENT_PROOF_BUCKET = 'payment-proofs';
const RENTAL_EVIDENCE_BUCKET = 'rental-evidence';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const STORAGE = { listings:'csh_listings_v1', requests:'csh_requests_v1', favorites:'csh_favorites_v1', bookings:'csh_bookings_v1' };

const seedListings = [
      {id:'demo-cam',title:'กล้อง Mirrorless พร้อมเลนส์คิท',category:'media',categoryLabel:'ถ่ายภาพและวิดีโอ',price:350,deposit:1500,location:'ใกล้คณะนิเทศฯ',owner:'นนท์',initial:'น',rating:'ผู้ให้เช่าตัวอย่าง',condition:'สภาพดี ใช้งานปกติ',description:'กล้องสำหรับถ่ายงานกิจกรรมหรือโปรเจกต์วิดีโอ มาพร้อมเลนส์คิท แบตเตอรี่ 1 ก้อน และสายคล้อง โปรดตรวจอุปกรณ์ร่วมกันตอนรับของ',image:'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85',tag:'เหมาะกับโปรเจกต์',available:true},
      {id:'demo-mic',title:'ไมโครโฟนไร้สาย 2 ตัว',category:'media',categoryLabel:'ถ่ายภาพและวิดีโอ',price:150,deposit:500,location:'หอพักโซนเหนือ',owner:'แพร',initial:'พ',rating:'ผู้ให้เช่าตัวอย่าง',condition:'สภาพดี มีเคสเก็บ',description:'ไมโครโฟนไร้สายสำหรับสัมภาษณ์ ถ่ายคลิป หรืองานนำเสนอ กรุณาตรวจแบตเตอรี่และอุปกรณ์ในกล่องตอนรับสินค้า',image:'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=900&q=85',tag:'ราคาประหยัด',available:true},
      {id:'demo-tripod',title:'ขาตั้งกล้องปรับระดับได้',category:'media',categoryLabel:'ถ่ายภาพและวิดีโอ',price:80,deposit:200,location:'อาคารกิจกรรมนักศึกษา',owner:'บอส',initial:'บ',rating:'ผู้ให้เช่าตัวอย่าง',condition:'มีรอยใช้งานเล็กน้อย',description:'ขาตั้งกล้องน้ำหนักเบา ปรับความสูงได้ มีหัวจับมาตรฐาน เหมาะกับงานถ่ายวิดีโอหรือถ่ายภาพนิ่ง',image:'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=900&q=85',tag:'ยอดนิยมในเดโม',available:true},
      {id:'demo-drill',title:'สว่านไฟฟ้าพร้อมดอกพื้นฐาน',category:'study',categoryLabel:'เรียนและโปรเจกต์',price:120,deposit:500,location:'ห้องชมรมเมกเกอร์',owner:'เจ',initial:'จ',rating:'ผู้ให้เช่าตัวอย่าง',condition:'ผ่านการตรวจสภาพในตัวอย่าง',description:'สำหรับงานประกอบชิ้นงานและโปรเจกต์เบื้องต้น ผู้ยืมควรมีความรู้การใช้งานที่ปลอดภัย และต้องคืนพร้อมอุปกรณ์ให้ครบ',image:'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=85',tag:'สำหรับงานประดิษฐ์',available:true},
      {id:'demo-projector',title:'โปรเจกเตอร์พกพา',category:'event',categoryLabel:'กิจกรรมและอีเวนต์',price:280,deposit:1000,location:'อาคารเรียนรวม',owner:'มิน',initial:'ม',rating:'ผู้ให้เช่าตัวอย่าง',condition:'สภาพดี พร้อมสายไฟ',description:'โปรเจกเตอร์สำหรับนำเสนอผลงานหรือกิจกรรมขนาดเล็ก ควรตรวจสอบพอร์ตและอุปกรณ์เชื่อมต่อที่ต้องใช้ก่อนทำรายการ',image:'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?auto=format&fit=crop&w=900&q=85',tag:'งานนำเสนอ',available:true},
      {id:'demo-suit',title:'ชุดสูทสีกรมท่า (ไซซ์ M)',category:'fashion',categoryLabel:'เสื้อผ้าและโอกาสพิเศษ',price:180,deposit:600,location:'หอพักโซนกลาง',owner:'ฟ้า',initial:'ฟ',rating:'ผู้ให้เช่าตัวอย่าง',condition:'ซักทำความสะอาดก่อนส่งมอบ',description:'ชุดสูทสำหรับสัมภาษณ์งาน นำเสนอ หรือกิจกรรมทางการ โปรดสอบถามขนาดและลองความพอดีก่อนยืนยันการจอง',image:'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=85',tag:'ใช้เฉพาะโอกาส',available:true}
    ];

const categoryLabels = {all:'ทุกหมวดหมู่',media:'ถ่ายภาพและวิดีโอ',study:'เรียนและโปรเจกต์',event:'กิจกรรมและอีเวนต์',fashion:'เสื้อผ้าและโอกาสพิเศษ',other:'อื่น ๆ'};
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
let activeCategory = 'all';
let searchTerm = '';
let budgetMax = 'all';
let sortMode = 'recommended';
let toastTimeout;

function readStore(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (error) { console.warn('อ่าน localStorage ไม่สำเร็จ', error); return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { showToast('บันทึกข้อมูลไม่สำเร็จ เบราว์เซอร์อาจจำกัดพื้นที่เก็บข้อมูล'); return false; }
}
function getListings() {
  if (liveMode) return listingCache;
  const saved = readStore(STORAGE.listings, null);
  if (!saved) { writeStore(STORAGE.listings, seedListings); return [...seedListings]; }
  return saved;
}
function getFavorites() { return readStore(STORAGE.favorites, []); }
async function loadCurrentProfile(userId = currentSession?.user?.id) {
  if (!liveMode || !userId) {
    currentProfile = null;
    currentIsAdmin = false;
    updateAuthButtons();
    return;
  }
  const { data, error } = await supabase.from('profiles')
    .select('id,full_name,university,is_admin')
    .eq('id', userId).maybeSingle();
  if (currentSession?.user?.id !== userId) return;
  if (error) {
    console.warn('โหลดโปรไฟล์/สิทธิ์ไม่สำเร็จ ตรวจ migration ของ Supabase', error);
    currentProfile = null;
    currentIsAdmin = false;
    showToast('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ: ' + friendlyError(error));
  } else {
    currentProfile = data || null;
    currentIsAdmin = Boolean(data?.is_admin);
  }
  updateAuthButtons();
}
async function uploadListingImage(file) {
  if (!file || !file.size) return { url: null, path: null };
  if (!liveMode || !supabase) throw new Error('ต้องตั้งค่า Supabase ก่อนอัปโหลดรูป');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) throw new Error('รองรับเฉพาะรูป JPG, PNG, WebP หรือ GIF');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('รูปต้องมีขนาดไม่เกิน 5 MB');
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
  const path = `${currentSession.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(LISTING_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type
  });
  if (error) throw error;
  const { data } = supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
async function uploadConversationImage(file, conversationId) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) throw new Error('รองรับเฉพาะรูป JPG, PNG, WebP หรือ GIF');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('รูปต้องมีขนาดไม่เกิน 5 MB');
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
  const path = `${conversationId}/${currentSession.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(CHAT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type
  });
  if (error) throw error;
  return path;
}
function getImageExtension(file) {
  const extension = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[file?.type];
  if (!extension) throw new Error('รองรับเฉพาะรูป JPG, PNG หรือ WebP');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('รูปต้องมีขนาดไม่เกิน 5 MB');
  return extension;
}
async function uploadRentalEvidence(file, path) {
  const extension = getImageExtension(file);
  const fullPath = `${path}.${extension}`;
  const { error } = await supabase.storage.from(RENTAL_EVIDENCE_BUCKET).upload(fullPath, file, {
    cacheControl:'3600', upsert:false, contentType:file.type
  });
  if (error) throw error;
  return fullPath;
}
async function uploadProfileAvatar(file) {
  const extension = getImageExtension(file);
  const path = `${currentSession.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(LISTING_IMAGE_BUCKET).upload(path, file, {
    cacheControl:'3600', upsert:false, contentType:file.type
  });
  if (error) throw error;
  return { path, url:supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}
async function uploadPaymentProof(file, bookingId) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) throw new Error('เลือกรูปหลักฐาน JPG, PNG หรือ WebP เท่านั้น');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('รูปหลักฐานต้องมีขนาดไม่เกิน 5 MB');
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
  const path = `${currentSession.user.id}/${bookingId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type
  });
  if (error) throw error;
  return path;
}
function formatBaht(n) { return Number(n || 0).toLocaleString('th-TH'); }
function formatDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function addDateDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}
function formatDateThai(value) { if (!value) return '-'; const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}); }
function rentalDaysInclusive(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || end < start) return 0;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.floor((endTime - startTime) / 86400000) + 1 : 0;
}
function createRequestKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 3300);
}
function openModal(title, subtitle, content, wide=false) {
  $('#modalTitle').textContent = title; $('#modalSubtitle').textContent = subtitle || '';
  $('#modalContent').innerHTML = content; $('#modalBox').classList.toggle('wide', wide);
  $('#modalBackdrop').classList.add('open'); document.body.style.overflow = 'hidden';
  setTimeout(() => { const first = $('#modalContent input, #modalContent select, #modalContent textarea, #modalContent button'); if(first) first.focus(); }, 30);
}
function closeModal() {
  $('#modalBackdrop').classList.remove('open');
  document.body.style.overflow = '';
  if (locationPickerMap) {
    locationPickerMap.remove();
    locationPickerMap = null;
    locationPickerMarker = null;
  }
  destroyModalMap();
}
function destroyModalMap() {
  if (!activeModalMap) return;
  try { activeModalMap.destroy(); } catch (error) { console.warn('ปิดแผนที่ไม่สำเร็จ', error); }
  activeModalMap = null;
}
function closeChatDock() {
  $('#chatDock')?.setAttribute('hidden', '');
  if ($('#messageList')) $('#messageList').innerHTML = '';
  const form = $('#messageForm');
  form?.reset();
  clearMessageImagePreview();
  chatSignedUrlCache.clear();
  chatShareChoices = [];
  activeConversation = null;
  if (conversationChannel) void supabase.removeChannel(conversationChannel);
  conversationChannel = null;
  if (conversationRecoveryTimer) clearInterval(conversationRecoveryTimer);
  conversationRecoveryTimer = null;
}
function clearMessageImagePreview(clearFile = true) {
  const preview = $('#messageImagePreview');
  if (!preview) return;
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.hidden = true;
  preview.removeAttribute('src');
  const input = $('#messageImage');
  if (clearFile && input) input.value = '';
  if ($('#clearMessageImage')) $('#clearMessageImage').hidden = true;
}
function friendlyError(error) {
  const message = String(error?.message || error || 'เกิดข้อผิดพลาด');
  if (/invalid login credentials/i.test(message)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(message)) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  if (/user already registered/i.test(message)) return 'อีเมลนี้สมัครสมาชิกแล้ว ลองเข้าสู่ระบบ';
  if (/password should be at least/i.test(message)) return 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
  if (/approved_dates_do_not_overlap|conflicting key|exclusion constraint/i.test(message)) return 'วันดังกล่าวมีการจองที่อนุมัติแล้ว กรุณาปฏิเสธคำขอนี้หรือเลือกวันอื่น';
  if (/bookings_request_key_unique|duplicate key value/i.test(message)) return 'คำขอนี้ถูกส่งไปแล้ว กรุณาตรวจสอบรายการจองของคุณ';
  if (/conversations_listing_id_fkey/i.test(message)) return 'ลบประกาศนี้ไม่ได้เพราะมีประวัติแชตอยู่ คุณสามารถซ่อนประกาศแทนได้';
  if (/row-level security|permission denied/i.test(message)) return 'ไม่มีสิทธิ์ทำรายการนี้ ตรวจสอบบัญชีและการตั้งค่า RLS ในฐานข้อมูล';
  if (/set_booking_meeting_points|pickup_point_lat|return_point_lat/i.test(message)) return 'ฐานข้อมูลยังไม่ได้ติดตั้ง migration หมุดจุดนัด (meeting_points_route_migration.sql) โปรดแจ้งผู้ดูแลระบบ';
  if (/service_fee|owner_payouts|platform_fee_settings|promptpay_id|admin_update_promptpay|admin_update_platform_fee|admin_record_owner_payout|admin_platform_finance_summary/i.test(message)) return 'ฐานข้อมูลยังไม่ได้ติดตั้ง migration ค่าบริการ/PromptPay/การโอนให้เจ้าของ (service_fee_promptpay_payout_migration.sql) โปรดแจ้งผู้ดูแลระบบ';
  if (/payment_settings|booking_payments|booking_payment_events|submit_booking_payment|admin_review_booking_payment|admin_record_deposit_refund|admin_update_payment_instructions|booking_payment_proof_path/i.test(message)) return 'ฐานข้อมูลยังไม่ได้ติดตั้ง migration ระบบชำระเงินและเงินมัดจำ โปรดแจ้งผู้ดูแลระบบ';
  if (/rental_reviews|issue_reports|get_listing_review_stats|confirm_booking_milestone|owner_handed_over_at|renter_returned_at|schema cache/i.test(message)) return 'ฐานข้อมูลยังไม่ได้ติดตั้ง migration ระบบรับคืน รีวิว และรายงานปัญหา โปรดแจ้งผู้ดูแลระบบ';
  return message;
}
function isChatAttachmentSchemaMissing(error) {
  return /(?:message_type|image_path|listing_id|wanted_request_id).*(?:does not exist|schema cache)|column .*messages.* does not exist/i.test(String(error?.message || error || ''));
}
function setConnectionNotice() {
  const box = $('#connectionNotice');
  box.hidden = liveMode;
  const footer = $('#footerNote');
  if (liveMode) {
    box.style.background = '#faf0e1'; box.style.borderColor = '#a6dbd4'; box.style.color = '#1c574f';
    box.textContent = 'เชื่อมต่อโหมดฐานข้อมูลแล้ว: ประกาศและการจองจะถูกเก็บใน Supabase';
    if (footer) footer.innerHTML = 'Campus Sharing Hub · Supabase MVP<br>ประกาศและคำขอจองบันทึกลงฐานข้อมูลกลาง ไม่มีการชำระเงินจริง';
    $('#listingSectionDescription').textContent = 'รายการจากสมาชิกที่พร้อมให้เช่า ค้นหาและส่งคำขอจองได้';
  } else {
    box.style.background = '#fff3e2'; box.style.borderColor = '#e9d8a6'; box.style.color = '#6b5310';
    box.innerHTML = 'เว็บไซต์ยังอยู่ใน <strong>โหมดตัวอย่าง</strong> เพราะยังไม่ได้ตั้งค่า Supabase — ข้อมูลที่สร้างจะอยู่ในเบราว์เซอร์นี้เท่านั้น เปิดไฟล์ <code>.env.example</code> และทำตามคู่มือ README เพื่อเปิดระบบจริง';
    if (footer) footer.innerHTML = 'Campus Sharing Hub · Prototype Demo<br>ข้อมูลรายการและธุรกรรมเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ยังไม่ใช่บริการเช่าจริง';
    $('#listingSectionDescription').textContent = 'รายการตัวอย่างสำหรับทดลองระบบ ราคาและข้อมูลเป็นข้อมูลสมมติ';
  }
}
function fromDbListing(row) {
  const owner = row.profiles?.full_name || row.owner_name || 'สมาชิก';
  return {
    id: row.id, owner_id: row.owner_id, title: row.title, category: row.category,
    categoryLabel: categoryLabels[row.category] || 'อื่น ๆ', price: Number(row.price_per_day), deposit: Number(row.deposit || 0),
    location: row.location, owner, ownerBio:row.profiles?.bio || '', ownerAvatar:row.profiles?.avatar_url || '', initial: owner.slice(0,1), condition: row.condition,
    description: row.description, image: row.image_url || 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80', image_path: row.image_path || null,
    tag: row.is_available ? 'สมาชิกลงประกาศ' : 'ไม่พร้อมให้เช่า', available: row.is_available,
    latitude: row.pickup_latitude == null ? null : Number(row.pickup_latitude),
    longitude: row.pickup_longitude == null ? null : Number(row.pickup_longitude),
    addressText: row.address_text || '',
    address: {
      houseNo: row.address_house_no || '', moo: row.address_moo || '', subdistrict: row.address_subdistrict || '',
      district: row.address_district || '', province: row.address_province || ''
    },
    isReal: true, created_at: row.created_at
  };
}
async function refreshListings() {
  if (!liveMode) { renderListings(); return; }
  const { data, error } = await supabase.from('listings')
    .select('*, profiles!listings_owner_id_fkey(*)')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('โหลดประกาศไม่สำเร็จ', error);
    showToast('โหลดรายการไม่สำเร็จ: ' + friendlyError(error));
    listingCache = [];
  } else {
    listingCache = (data || []).map(fromDbListing);
  }
  renderListings();
}
function updateAuthButtons() {
  const signedIn = Boolean(currentSession?.user);
  const loginButton = $('#openAuthTop');
  const accountButton = $('#openAccountTop');
  if (loginButton) loginButton.hidden = signedIn;
  if (accountButton) {
    accountButton.hidden = !signedIn;
    const name = currentProfile?.full_name || currentSession?.user?.user_metadata?.full_name || currentSession?.user?.email?.split('@')[0] || 'สมาชิก';
    const avatar = currentProfile?.avatar_url
      ? `<img class="nav-profile-avatar" src="${escapeHTML(currentProfile.avatar_url)}" alt="">`
      : `<span class="nav-profile-avatar nav-profile-initial" aria-hidden="true">${escapeHTML(name.slice(0,1))}</span>`;
    accountButton.innerHTML = signedIn ? `${avatar}<span>โปรไฟล์ของฉัน</span>` : 'โปรไฟล์ของฉัน';
    accountButton.setAttribute('aria-label', `เปิดโปรไฟล์ของ ${name}`);
    accountButton.title = `${name} · เปิดโปรไฟล์ของฉัน`;
  }
  const inboxButton = $('#openInboxTop');
  const notificationButton = $('#openNotificationsTop');
  if (inboxButton) inboxButton.hidden = !signedIn;
  if (notificationButton) notificationButton.hidden = !signedIn;
  const chatLauncher = $('#chatLauncher');
  if (chatLauncher) chatLauncher.hidden = !signedIn;
}

function renderListingMap(items = getListings().filter(item => item.available !== false)) {
  const mapElement = $('#listingMap');
  if (!mapElement || !mapMode) return;
  if (!listingMap) {
    listingMap = L.map(mapElement, { scrollWheelZoom: false }).fitBounds(THAILAND_BOUNDS, { padding: [18, 18] });
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'map-message map-loading';
    loadingMessage.textContent = 'กำลังโหลดแผนที่จาก OpenStreetMap…';
    mapElement.append(loadingMessage);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
    }).addTo(listingMap);
    tiles.on('load', () => {
      mapElement.querySelector('.map-loading')?.remove();
    });
    let tileErrorShown = false;
    tiles.on('tileerror', () => {
      mapElement.querySelector('.map-loading')?.remove();
      if (tileErrorShown) return;
      tileErrorShown = true;
      showToast('โหลดแผนที่ไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    });
  }
  listingMarkers.forEach(marker => marker.remove());
  listingMarkers = [];
  const located = items.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  const existingMessage = mapElement.querySelector('.map-empty');
  if (existingMessage) existingMessage.remove();
  if (!located.length) {
    const message = document.createElement('div');
    message.className = 'map-message map-empty';
    message.textContent = liveMode
      ? 'ยังไม่มีประกาศที่บันทึกพิกัดโดยประมาณไว้ จุดรับเดิมไม่ได้ถูกคาดเดาหรือเติมพิกัดให้อัตโนมัติ'
      : 'แผนที่จะแสดงพิกัดจริงที่เจ้าของประกาศบันทึกไว้เมื่อเชื่อมต่อฐานข้อมูล';
    mapElement.append(message);
    listingMap.fitBounds(THAILAND_BOUNDS, { padding: [18, 18] });
    return;
  }
  const bounds = [];
  for (const item of located) {
    const point = [item.latitude, item.longitude];
    bounds.push(point);
    const marker = L.marker(point, {
      icon: L.divIcon({
        className: 'price-marker-wrap',
        html: `<span class="price-marker">฿${formatBaht(item.price)}</span>`,
        iconSize: [76, 30],
        iconAnchor: [38, 30]
      })
    }).addTo(listingMap);
    marker.bindPopup(`<article class="map-popup"><img src="${escapeHTML(item.image || '')}" alt=""><div><strong>${escapeHTML(item.title)}</strong><span>฿${formatBaht(item.price)} / วัน</span><small>พร้อมให้เช่า · ${escapeHTML(item.location || 'ยังไม่ได้ระบุตำแหน่ง')}</small><button type="button" data-action="detail" data-id="${escapeHTML(item.id)}">ดูรายละเอียด</button></div></article>`);
    listingMarkers.push(marker);
  }
  if (bounds.length === 1) listingMap.setView(bounds[0], 15);
  else listingMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
}

function setListingsView(useMap) {
  mapMode = useMap;
  $('#listingGrid').hidden = useMap;
  $('#listingMap').hidden = !useMap;
  $('#listViewButton').classList.toggle('active', !useMap);
  $('#mapViewButton').classList.toggle('active', useMap);
  $('#listViewButton').setAttribute('aria-pressed', String(!useMap));
  $('#mapViewButton').setAttribute('aria-pressed', String(useMap));
  if (useMap) {
    renderListings();
    requestAnimationFrame(() => listingMap?.invalidateSize());
  }
}

function initializeLocationPicker(item) {
  const element = $('#locationPicker');
  if (!element || !liveMode) return;
  const latInput = $('#newLatitude');
  const lngInput = $('#newLongitude');
  const coordsPresent = Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude);
  const initialPoint = coordsPresent ? [item.latitude, item.longitude] : null;
  locationPickerMap = L.map(element);
  if (initialPoint) locationPickerMap.setView(initialPoint, 15);
  else locationPickerMap.fitBounds(THAILAND_BOUNDS, { padding: [18, 18] });
  const loadingMessage = document.createElement('div');
  loadingMessage.className = 'map-message map-loading';
  loadingMessage.textContent = 'กำลังโหลดแผนที่จาก OpenStreetMap…';
  element.append(loadingMessage);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
  }).addTo(locationPickerMap);
  tiles.on('load', () => loadingMessage.remove());
  let pickerErrorShown = false;
  tiles.on('tileerror', () => {
    loadingMessage.remove();
    if (pickerErrorShown) return;
    pickerErrorShown = true;
    showToast('โหลดแผนที่เลือกจุดรับไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
  });
  const updateCoordinates = point => {
    latInput.value = point.lat.toFixed(6);
    lngInput.value = point.lng.toFixed(6);
  };
  const placeMarker = point => {
    if (!locationPickerMarker) {
      locationPickerMarker = L.marker(point, {
        draggable:true,
        icon:L.divIcon({
          className:'location-marker-wrap',
          html:'<span class="location-marker"></span>',
          iconSize:[24,24],
          iconAnchor:[12,12]
        })
      }).addTo(locationPickerMap);
      locationPickerMarker.on('dragend', event => updateCoordinates(event.target.getLatLng()));
    } else locationPickerMarker.setLatLng(point);
    updateCoordinates(L.latLng(point));
  };
  if (initialPoint) placeMarker({ lat:initialPoint[0], lng:initialPoint[1] });
  locationPickerMap.on('click', event => placeMarker(event.latlng));
  const syncMarker = () => {
    if (!latInput.value.trim() && !lngInput.value.trim()) {
      locationPickerMarker?.remove();
      locationPickerMarker = null;
      locationPickerMap.fitBounds(THAILAND_BOUNDS, { padding: [18, 18] });
      return;
    }
    if (!latInput.value.trim() || !lngInput.value.trim()) return;
    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    const point = { lat, lng };
    placeMarker(point);
    locationPickerMap.setView([lat, lng], Math.max(locationPickerMap.getZoom(), 14));
  };
  latInput.addEventListener('change', syncMarker);
  lngInput.addEventListener('change', syncMarker);
  requestAnimationFrame(() => locationPickerMap?.invalidateSize());
}

function listingCard(item) {
  const favorites = getFavorites(); const saved = favorites.includes(item.id);
  return `<article class="listing-card">
    <div class="listing-image-wrap">
      <img class="listing-image" src="${escapeHTML(item.image || '')}" alt="${escapeHTML(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'">
      <span class="tag">${escapeHTML(item.tag || item.categoryLabel || 'รายการใหม่')}</span>
      <button class="heart ${saved?'saved':''}" type="button" data-action="favorite" data-id="${escapeHTML(item.id)}" aria-pressed="${saved}" aria-label="${saved?'นำออกจากรายการที่บันทึก':'บันทึกประกาศนี้'}" title="${saved?'นำออกจากรายการโปรด':'บันทึกเป็นรายการโปรด'}">${saved?'♥':'♡'}</button>
    </div>
    <div class="listing-body"><div class="listing-meta"><span class="owner">${item.ownerAvatar?`<img class="avatar" src="${escapeHTML(item.ownerAvatar)}" alt="" loading="lazy">`:`<span class="avatar">${escapeHTML(item.initial || 'U')}</span>`}${escapeHTML(item.owner || 'สมาชิก')}</span><span class="badge-demo">${item.isReal?'สมาชิก':'ตัวอย่าง'}</span></div>
      <h3 class="listing-title">${escapeHTML(item.title)}</h3><div class="listing-location">⌖ ${escapeHTML(item.location || 'ยังไม่ได้ระบุตำแหน่ง')}</div>
      <div class="listing-bottom"><div class="listing-price-group"><span class="availability-label"><span aria-hidden="true"></span>พร้อมให้เช่า</span><div class="price">฿${formatBaht(item.price)} <small>/ วัน</small></div><div class="deposit">${item.isReal?'เงินมัดจำ':'มัดจำตัวอย่าง'} ฿${formatBaht(item.deposit || 0)}</div></div><div class="listing-actions"><button class="tiny-btn detail-btn" type="button" data-action="detail" data-id="${escapeHTML(item.id)}">รายละเอียด</button><button class="btn btn-primary card-book-btn" type="button" data-action="book" data-id="${escapeHTML(item.id)}" aria-label="ขอจอง ${escapeHTML(item.title)}">ขอจอง</button></div></div>
    </div>
  </article>`;
}
function renderListings() {
  let items = getListings().filter(x => x.available !== false);
  if (activeCategory === 'favorites') { const favorites = getFavorites(); items = items.filter(x => favorites.includes(x.id)); }
  else if (activeCategory !== 'all') items = items.filter(x => x.category === activeCategory);
  if (searchTerm) { const q = searchTerm.toLocaleLowerCase('th-TH'); items = items.filter(x => [x.title,x.description,x.categoryLabel,x.location,x.owner].some(v => String(v||'').toLocaleLowerCase('th-TH').includes(q))); }
  if (budgetMax !== 'all') items = items.filter(x => Number(x.price) <= Number(budgetMax));
  if (sortMode === 'priceAsc') items.sort((a,b)=>a.price-b.price);
  if (sortMode === 'priceDesc') items.sort((a,b)=>b.price-a.price);
  const grid = $('#listingGrid');
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><strong>${liveMode?'ยังไม่มีรายการที่ตรงกัน':'ยังไม่พบรายการที่ตรงกัน'}</strong><span>${liveMode?'ลองค้นหาคำอื่น หรือเข้าสู่ระบบแล้วลงประกาศชิ้นแรก':'เปลี่ยนคำค้นหาหรือหมวดหมู่ หรือแจ้งความต้องการเพื่อบันทึกสิ่งที่กำลังหา'}</span><br><button class="btn btn-primary" style="margin-top:15px" data-action="request">＋ แจ้งความต้องการ</button></div>`;
  } else grid.innerHTML = items.map(listingCard).join('');
  if (mapMode) renderListingMap(items);
  $$('#filterRow .chip').forEach(btn => { const active = btn.dataset.category === activeCategory; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', String(active)); });
  $$('#categoryGrid .category-card').forEach(btn => { const active = btn.dataset.category === activeCategory; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', String(active)); });
}
function listingDetail(id) {
  const item = getListings().find(x => x.id === id); if(!item) return showToast('ไม่พบรายการนี้');
  const ownItem = liveMode && currentSession?.user?.id === item.owner_id;
  const button = ownItem
    ? '<div class="form-footnote">นี่คือประกาศของคุณ จัดการสถานะได้จาก “บัญชีของฉัน”</div>'
    : `${liveMode?`<button class="btn btn-secondary" style="width:100%;margin-top:8px" data-action="listing-chat" data-id="${escapeHTML(item.id)}">แชตกับเจ้าของ</button><button class="btn btn-secondary" style="width:100%;margin-top:8px" data-action="report-listing" data-id="${escapeHTML(item.id)}" data-owner-id="${escapeHTML(item.owner_id)}">รายงานประกาศหรือผู้ใช้</button>`:''}<button class="btn btn-primary" style="width:100%;margin-top:8px" data-action="book" data-id="${escapeHTML(item.id)}">ขอจองรายการนี้</button>`;
  const ownerProfile = `${item.ownerAvatar?`<img class="avatar" src="${escapeHTML(item.ownerAvatar)}" alt="" loading="lazy">`:''}<span>${escapeHTML(item.owner || 'สมาชิก')}</span>`;
  const html = `<div class="detail-layout"><img class="detail-img" src="${escapeHTML(item.image || '')}" alt="${escapeHTML(item.title)}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'"><div class="detail-copy"><span class="badge-demo">${escapeHTML(item.categoryLabel || 'รายการ')}</span><h3 style="margin-top:10px">${escapeHTML(item.title)}</h3><div class="listing-location">⌖ ${escapeHTML(item.location || 'ยังไม่ได้ระบุตำแหน่ง')}</div>${listingAddressText(item)?`<div class="listing-location detail-address">🏠 ${escapeHTML(listingAddressText(item))}</div>`:''}<div class="detail-price">฿${formatBaht(item.price)} <small>/ วัน</small></div><div class="detail-row"><span>เงินมัดจำ</span><strong>฿${formatBaht(item.deposit || 0)}</strong></div><div class="detail-row"><span>เจ้าของรายการ</span><strong class="owner-profile">${ownerProfile}</strong></div><p>${escapeHTML(item.ownerBio || 'ยังไม่ได้ระบุรายละเอียด')}</p><div class="detail-row"><span>สภาพของ</span><strong>${escapeHTML(item.condition || 'ยังไม่ได้ระบุสภาพ')}</strong></div><p>${escapeHTML(item.description || 'ยังไม่ได้ระบุรายละเอียด')}</p>${button}<p class="form-footnote">คำขอจองจะส่งให้เจ้าของอนุมัติหรือปฏิเสธ ยังไม่มีการชำระเงินจริง</p></div></div><section class="listing-reviews" id="listingReviews" aria-live="polite"><h3>รีวิวจากผู้เช่า</h3><div class="account-empty">กำลังโหลดรีวิว…</div></section>`;
  openModal('รายละเอียดรายการ','ตรวจสอบข้อมูลก่อนส่งคำขอจอง',html,true);
  if (liveMode) void loadListingReviews(item.id);
}
async function loadListingReviews(listingId) {
  const panel = $('#listingReviews');
  if (!panel) return;
  const [statsResult, reviewsResult] = await Promise.all([
    supabase.rpc('get_listing_review_stats', { p_listing_id:listingId }),
    supabase.from('rental_reviews')
      .select('id,booking_id,reviewer_id,rating,comment,created_at,profiles!rental_reviews_reviewer_id_fkey(full_name)')
      .eq('listing_id', listingId)
      .eq('is_hidden', false)
      .order('created_at', { ascending:false })
      .limit(30)
  ]);
  if (statsResult.error || reviewsResult.error) {
    const error = statsResult.error || reviewsResult.error;
    panel.innerHTML = `<h3>รีวิวจากผู้เช่า</h3><div class="account-empty">โหลดรีวิวไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  const data = reviewsResult.data;
  const stats = statsResult.data?.[0];
  if (!data?.length) {
    panel.innerHTML = '<div class="review-heading"><h3>รีวิวจากผู้เช่า</h3><strong>ยังไม่มีคะแนน <small>(0 รีวิว)</small></strong></div><div class="account-empty">ยังไม่มีรีวิวสำหรับประกาศนี้</div>';
    return;
  }
  panel.innerHTML = `<div class="review-heading"><h3>รีวิวจากผู้เช่า</h3><strong>★ ${Number(stats?.average_rating || 0).toFixed(1)} <small>(${Number(stats?.review_count || 0)} รีวิว)</small></strong></div><div class="review-list">${data.map(review => `<article class="review-card"><div><strong>${escapeHTML(review.profiles?.full_name || 'สมาชิก')}</strong><span aria-label="${review.rating} จาก 5 ดาว">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span></div><time>${formatTime(review.created_at)}</time><p>${escapeHTML(review.comment || 'ไม่ได้เขียนความคิดเห็นเพิ่มเติม')}</p>${currentSession?.user && currentSession.user.id !== review.reviewer_id ? `<button class="text-action" data-action="report-review" data-id="${escapeHTML(review.id)}">รายงานรีวิว</button>` : ''}</article>`).join('')}</div>`;
}
function openReportForm({ bookingId = '', listingId = '', reportedUserId = '', reviewId = '' } = {}) {
  if (!currentSession?.user) { openAuthModal('login'); return; }
  openModal('รายงานปัญหา', 'ข้อมูลจะส่งให้ทีมแอดมินตรวจสอบ', `<form id="issueReportForm" data-booking-id="${escapeHTML(bookingId)}" data-listing-id="${escapeHTML(listingId)}" data-reported-user-id="${escapeHTML(reportedUserId)}" data-review-id="${escapeHTML(reviewId)}"><div class="form-field"><label for="reportCategory">ประเภทปัญหา</label><select id="reportCategory" name="category" required><option value="item_mismatch">สินค้าไม่ตรงรายละเอียด</option><option value="cannot_contact">ติดต่อคู่สัญญาไม่ได้</option><option value="handover_return">ปัญหาการรับหรือคืนสินค้า</option><option value="damaged_item">สินค้าเสียหาย</option><option value="user_conduct">พฤติกรรมผู้ใช้</option><option value="other">อื่น ๆ</option></select></div><div class="form-field"><label for="reportDescription">รายละเอียด</label><textarea id="reportDescription" name="description" minlength="5" maxlength="2000" required placeholder="อธิบายสิ่งที่เกิดขึ้นและข้อมูลที่ช่วยให้ตรวจสอบได้"></textarea></div><div class="form-field"><label for="reportEvidence">รูปประกอบ <span class="hint">(ไม่บังคับ · สูงสุด 5 รูป รูปละไม่เกิน 5 MB)</span></label><input id="reportEvidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp" multiple></div><p class="form-footnote">รายงานนี้จะเห็นได้เฉพาะคุณ คู่สัญญาที่เกี่ยวข้อง และแอดมิน</p><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="close">ยกเลิก</button><button class="btn btn-primary" type="submit">ส่งรายงาน</button></div></form>`);
}
async function submitIssueReport(form) {
  if (form.dataset.submitting === 'true') return;
  const data = new FormData(form);
  const files = Array.from(form.elements.namedItem('evidence').files || []);
  if (files.length > 5) return showToast('แนบภาพได้ไม่เกิน 5 รูป');
  try { files.forEach(getImageExtension); }
  catch (error) { return showToast(error.message); }
  const button = form.querySelector('button[type="submit"]');
  form.dataset.submitting = 'true';
  if (button) { button.disabled = true; button.textContent = 'กำลังส่งรายงาน…'; }
  const payload = {
    id:crypto.randomUUID(),
    reporter_id:currentSession.user.id,
    booking_id:form.dataset.bookingId || null,
    listing_id:form.dataset.listingId || null,
    reported_user_id:form.dataset.reportedUserId || null,
    review_id:form.dataset.reviewId || null,
    category:String(data.get('category') || ''),
    description:String(data.get('description') || '').trim()
  };
  const { error } = await supabase.from('issue_reports').insert(payload);
  if (error) {
    form.dataset.submitting = 'false';
    if (button) { button.disabled = false; button.textContent = 'ส่งรายงาน'; }
    return showToast('ส่งรายงานไม่สำเร็จ: ' + friendlyError(error));
  }
  try {
    for (const file of files) {
      const path = await uploadRentalEvidence(file, `report/${payload.id}/${currentSession.user.id}/${crypto.randomUUID()}`);
      const { error:attachError } = await supabase.rpc('attach_issue_report_evidence', {
        p_report_id:payload.id, p_storage_path:path
      });
      if (attachError) {
        const { error:cleanupError } = await supabase.storage.from(RENTAL_EVIDENCE_BUCKET).remove([path]);
        if (cleanupError) console.warn('ลบหลักฐานรายงานที่แนบไม่สำเร็จ', cleanupError);
        throw attachError;
      }
    }
  } catch (uploadError) {
    closeModal();
    showToast('รายงานถูกส่งแล้ว แต่แนบรูปไม่สำเร็จ: ' + friendlyError(uploadError));
    if (accountTab === 'my-reports' && $('#accountContent')) await renderAccountTab('my-reports');
    return;
  }
  closeModal();
  showToast('ส่งรายงานแล้ว คุณติดตามสถานะได้ในบัญชีของฉัน');
  if (accountTab === 'my-reports' && $('#accountContent')) await renderAccountTab('my-reports');
}
function openReviewForm(bookingId, listingId) {
  openModal('รีวิวหลังการเช่า', 'รีวิวได้เมื่อการเช่าเสร็จสิ้นแล้วเท่านั้น', `<form id="rentalReviewForm" data-booking-id="${escapeHTML(bookingId)}"><div class="form-field"><label for="reviewRating">คะแนน</label><select id="reviewRating" name="rating" required><option value="">เลือกคะแนน</option><option value="5">5 ดาว · ดีมาก</option><option value="4">4 ดาว · ดี</option><option value="3">3 ดาว · พอใช้</option><option value="2">2 ดาว · ควรปรับปรุง</option><option value="1">1 ดาว · ไม่พอใจ</option></select></div><div class="form-field"><label for="reviewComment">ความคิดเห็น <span class="hint">(ไม่บังคับ)</span></label><textarea id="reviewComment" name="comment" maxlength="1000" placeholder="แบ่งปันประสบการณ์การเช่า"></textarea></div><p class="form-footnote">รีวิวหนึ่งครั้งต่อรายการจอง ไม่สามารถแก้ไขหลังส่งได้</p><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="close">ยกเลิก</button><button class="btn btn-primary" type="submit">ส่งรีวิว</button></div></form>`);
  $('#rentalReviewForm').dataset.listingId = listingId;
}
async function submitRentalReview(form) {
  const data = new FormData(form);
  const { error } = await supabase.rpc('submit_rental_review', {
    p_booking_id:form.dataset.bookingId,
    p_rating:Number(data.get('rating')),
    p_comment:String(data.get('comment') || '').trim()
  });
  if (error) return showToast('ส่งรีวิวไม่สำเร็จ: ' + friendlyError(error));
  const listingId = form.dataset.listingId;
  closeModal();
  showToast('ขอบคุณสำหรับรีวิว');
  await renderAccountTab('as-renter');
  if (listingId) void loadListingReviews(listingId);
}
function meetingPickerMarkup(prefix, sameAsPickup = true) {
  return `<div class="form-field full meeting-picker-field"><label>ปักหมุดจุดนัดรับ / จุดคืนของ <span class="hint">(ไม่บังคับ · เห็นเฉพาะคู่สัญญา)</span></label>
    <div class="meeting-picker-toolbar" role="group" aria-label="เลือกหมุดที่จะวาง">
      <label class="chip-radio"><input type="radio" name="${prefix}PinKind" value="pickup" checked> หมุดจุดรับ</label>
      <label class="chip-radio"><input type="radio" name="${prefix}PinKind" value="return" ${sameAsPickup?'disabled':''}> หมุดจุดคืน</label>
      <label class="checkbox-row"><input type="checkbox" id="${prefix}SameReturn" ${sameAsPickup?'checked':''}> คืนที่จุดเดียวกับจุดรับ</label>
      <button type="button" class="btn btn-secondary btn-small" data-action="pin-my-location" data-prefix="${prefix}">ใช้ตำแหน่งของฉัน</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="pin-clear" data-prefix="${prefix}">ล้างหมุดที่เลือก</button>
    </div>
    <div id="${prefix}MeetingMap" class="meeting-map" aria-label="แผนที่ปักหมุดจุดนัด"></div>
    <small id="${prefix}MeetingSummary" aria-live="polite">แตะบนแผนที่เพื่อวางหมุด ลากหมุดเพื่อปรับตำแหน่ง</small></div>`;
}
function describePins(points, sameReturn) {
  const fmt = point => point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'ยังไม่ปัก';
  return `จุดรับ: ${fmt(points.pickup)} · จุดคืน: ${sameReturn ? 'เดียวกับจุดรับ' : fmt(points.return)}`;
}
function initMeetingPicker(prefix, { center = null, pickup = null, returnPoint = null } = {}) {
  const element = $(`#${prefix}MeetingMap`);
  if (!element) return;
  destroyModalMap();
  const same = $(`#${prefix}SameReturn`);
  const summary = $(`#${prefix}MeetingSummary`);
  const update = points => { if (summary) summary.textContent = describePins(points, same?.checked); };
  const picker = createMeetingPointPicker(element, { center, pickup, returnPoint, onChange:update });
  picker.prefix = prefix;
  activeModalMap = picker;
  $$(`input[name="${prefix}PinKind"]`).forEach(input => input.addEventListener('change', () => picker.setActive(input.value)));
  same?.addEventListener('change', () => {
    const returnRadio = $(`input[name="${prefix}PinKind"][value="return"]`);
    if (returnRadio) returnRadio.disabled = same.checked;
    if (same.checked) {
      picker.clear('return');
      const pickupRadio = $(`input[name="${prefix}PinKind"][value="pickup"]`);
      if (pickupRadio) { pickupRadio.checked = true; picker.setActive('pickup'); }
    }
    update(picker.getPoints());
  });
  update(picker.getPoints());
}
function readMeetingPicker() {
  if (!activeModalMap?.getPoints) return { pickup:null, return:null };
  const points = activeModalMap.getPoints();
  const same = $(`#${activeModalMap.prefix}SameReturn`)?.checked;
  return { pickup:points.pickup, return:same ? points.pickup : points.return };
}
function saveMeetingPoints(bookingId, pins) {
  return supabase.rpc('set_booking_meeting_points', {
    p_booking_id:bookingId,
    p_pickup_lat:pins.pickup?.lat ?? null,
    p_pickup_lng:pins.pickup?.lng ?? null,
    p_return_lat:pins.return?.lat ?? null,
    p_return_lng:pins.return?.lng ?? null
  });
}
async function loadBookingForMap(bookingId) {
  const { data:booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (error) { showToast('โหลดรายการจองไม่ได้: ' + friendlyError(error)); return null; }
  if (!booking) { showToast('ไม่พบรายการจองหรือคุณไม่มีสิทธิ์ดู'); return null; }
  const { data:listing } = await supabase.from('listings').select('id,title,owner_id,location,pickup_latitude,pickup_longitude').eq('id', booking.listing_id).maybeSingle();
  return { booking, listing };
}
async function openMeetingPointsEditor(bookingId) {
  if (!currentSession?.user) return openAuthModal('login');
  const loaded = await loadBookingForMap(bookingId);
  if (!loaded) return;
  const { booking, listing } = loaded;
  const pickup = toPoint(booking.pickup_point_lat, booking.pickup_point_lng);
  const returnPoint = toPoint(booking.return_point_lat, booking.return_point_lng);
  const same = !returnPoint || (pickup && returnPoint.lat === pickup.lat && returnPoint.lng === pickup.lng);
  openModal('ปักหมุดจุดนัดรับ / คืนของ', listing?.title || 'รายการจอง', `<form id="meetingPointsForm" data-id="${escapeHTML(booking.id)}">${meetingPickerMarkup('edit', same)}<p class="form-footnote">คู่สัญญาจะได้รับแจ้งเตือนเมื่อบันทึก และเปิดดูเส้นทางจากตำแหน่งของตัวเองได้</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกหมุด</button></div></form>`, true);
  initMeetingPicker('edit', { center:toPoint(listing?.pickup_latitude, listing?.pickup_longitude), pickup, returnPoint:same ? null : returnPoint });
}
async function submitMeetingPoints(form) {
  const pins = readMeetingPicker();
  if (!pins.pickup && pins.return) return showToast('กรุณาปักหมุดจุดรับก่อน');
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const { error } = await saveMeetingPoints(form.dataset.id, pins);
  if (button?.isConnected) button.disabled = false;
  if (error) return showToast('บันทึกหมุดไม่สำเร็จ: ' + friendlyError(error));
  closeModal();
  showToast('บันทึกจุดนัดรับ/คืนของแล้ว');
  if ($('#accountContent')) await renderAccountTab(accountTab);
}
async function openRouteModal(bookingId, kind) {
  if (!currentSession?.user) return openAuthModal('login');
  const loaded = await loadBookingForMap(bookingId);
  if (!loaded) return;
  const { booking, listing } = loaded;
  const destination = kind === 'return'
    ? (toPoint(booking.return_point_lat, booking.return_point_lng) || toPoint(booking.pickup_point_lat, booking.pickup_point_lng))
    : toPoint(booking.pickup_point_lat, booking.pickup_point_lng);
  if (!destination) return showToast('ยังไม่มีหมุดจุดนัด กรุณาปักหมุดก่อน');
  const label = kind === 'return' ? 'จุดคืนของ' : 'จุดนัดรับ';
  openModal(`เส้นทางไป${label}`, `${listing?.title || 'รายการจอง'} · ${booking.pickup_location || ''}`, `<div class="route-panel"><div class="route-toolbar"><label class="chip-radio"><input type="radio" name="routeMode" value="foot" checked> เดิน</label><label class="chip-radio"><input type="radio" name="routeMode" value="car"> ขับรถ</label><button type="button" class="btn btn-primary btn-small" data-action="route-from-me">นำทางจากตำแหน่งของฉัน</button><a id="routeExternalLink" class="btn btn-secondary btn-small" href="${escapeHTML(googleMapsDirectionsUrl(destination))}" target="_blank" rel="noopener noreferrer">เปิดใน Google Maps</a></div><div id="routeMap" class="meeting-map route-map" aria-label="แผนที่เส้นทาง"></div><p id="routeInfo" class="route-info" aria-live="polite">กด “นำทางจากตำแหน่งของฉัน” แล้วอนุญาตให้เบราว์เซอร์ใช้ตำแหน่ง</p><p class="form-footnote">เส้นทางคำนวณจากข้อมูล OpenStreetMap อาจไม่ตรงกับทางเดินในมหาวิทยาลัยทุกเส้น ตรวจสอบความปลอดภัยและนัดในที่สาธารณะเสมอ</p></div>`, true);
  destroyModalMap();
  const routeMap = createRouteMap($('#routeMap'), destination, kind === 'return' ? 'return' : 'pickup');
  routeMap.destination = destination;
  activeModalMap = routeMap;
}
async function routeFromMyLocation() {
  const routeMap = activeModalMap;
  if (!routeMap?.showRoute) return;
  const info = $('#routeInfo');
  const mode = $('input[name="routeMode"]:checked')?.value || 'foot';
  if (info) info.textContent = 'กำลังหาตำแหน่งและคำนวณเส้นทาง…';
  try {
    const me = await getCurrentPosition();
    if (activeModalMap !== routeMap) return;
    const result = await routeMap.showRoute(me, mode);
    if (activeModalMap !== routeMap) return;
    const link = $('#routeExternalLink');
    if (link) link.href = googleMapsDirectionsUrl(routeMap.destination, me, mode);
    if (info) info.textContent = result.routed
      ? `${mode === 'car' ? 'ขับรถ' : 'เดิน'} ${formatDistance(result.distance)} · ประมาณ ${formatDuration(result.duration)}`
      : `ระยะทางเส้นตรงประมาณ ${formatDistance(result.distance)} (คำนวณเส้นทางไม่สำเร็จ ลองเปิดใน Google Maps)`;
  } catch (error) {
    if (info) info.textContent = error.message || 'ระบุตำแหน่งไม่สำเร็จ';
  }
}
async function openBooking(id) {
  const item = getListings().find(x=>x.id===id); if(!item) return showToast('ไม่พบรายการนี้');
  if (liveMode && !currentSession?.user) { closeModal(); openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนส่งคำขอจอง'); }
  if (liveMode && currentSession.user.id === item.owner_id) return showToast('คุณไม่สามารถจองประกาศของตัวเองได้');
  if (liveMode && item.available === false) return showToast('รายการนี้ไม่พร้อมให้เช่าในขณะนี้');
  const minDate = formatDateInput();
  const nextDate = addDateDays(minDate, 1);
  const feeSettings = await loadPlatformFeeSettings();
  openModal('ส่งคำขอจอง',`รายการ: ${item.title}`,`<form id="bookingForm" data-id="${escapeHTML(item.id)}" data-request-key="${escapeHTML(createRequestKey())}"><div class="form-grid">
    <div class="form-field"><label for="bookStart">วันรับของ</label><input type="date" id="bookStart" name="start" min="${minDate}" value="${minDate}" required></div>
    <div class="form-field"><label for="bookEnd">วันคืนของ</label><input type="date" id="bookEnd" name="end" min="${minDate}" value="${nextDate}" required></div>
    <div class="form-field full"><label for="bookPlace">จุดนัดรับที่สะดวก</label><input id="bookPlace" name="place" placeholder="เช่น หน้าอาคารเรียนรวม" required minlength="2" maxlength="100"></div>
    <div class="form-field full"><label for="bookPhone">เบอร์ติดต่อสำหรับรายการเช่านี้ <span class="hint">(ไม่บังคับ)</span></label><input id="bookPhone" name="contact_phone" type="tel" maxlength="25" autocomplete="tel" placeholder="ใช้ติดต่อเฉพาะคู่สัญญา"></div>
    <div class="form-field full"><label for="bookNote">ข้อความถึงผู้ปล่อยเช่า <span class="hint">(ไม่บังคับ)</span></label><textarea id="bookNote" name="note" placeholder="เช่น ขอเช็กอุปกรณ์ก่อนรับของ" maxlength="300"></textarea></div>
    ${liveMode?meetingPickerMarkup('booking'):''}
  </div><div class="booking-total"><div><strong>ค่าเช่าต่อวัน</strong><div class="hint">฿${formatBaht(item.price)} / วัน</div><div class="hint">เงินมัดจำ ฿${formatBaht(item.deposit||0)} (แยกจากค่าเช่า)</div><div class="hint">ค่าบริการแพลตฟอร์ม ${escapeHTML(feeSettingsText(feeSettings))}</div></div><div id="bookingEstimate" aria-live="polite"></div></div><p class="form-footnote">คิดรวมวันรับและวันคืน · ยอดนี้เป็นสรุปก่อนส่งคำขอ ไม่ใช่การชำระเงิน · หากเจ้าของอนุมัติ จึงชำระผ่าน QR PromptPay และแนบสลิปได้ · ระบบคำนวณค่าบริการจริงตอนส่งคำขอ</p><p class="form-footnote">เมื่อส่งแล้ว เจ้าของรายการจะเห็นคำขอในบัญชีและเลือกอนุมัติหรือปฏิเสธได้</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="back-detail" data-id="${escapeHTML(item.id)}">กลับ</button><button type="submit" class="btn btn-primary">ส่งคำขอจอง</button></div></form>`);
  const form = $('#bookingForm');
  const updateEstimate = () => {
    const days = rentalDaysInclusive(form.start.value, form.end.value);
    $('#bookingEstimate').innerHTML = days
      ? (() => {
          const rent = days * item.price;
          const fee = computeServiceFee(rent, feeSettings);
          const deposit = Number(item.deposit || 0);
          return `<strong>${days} วัน</strong><div class="hint">ค่าเช่ารวม ฿${formatBaht(rent)}</div><div class="hint">ค่าบริการ ฿${formatBaht(fee)}</div><div class="hint">ชำระค่าเช่า + ค่าบริการ ฿${formatBaht(rent + fee)}</div><div class="hint">เงินมัดจำ ฿${formatBaht(deposit)} · รวมทั้งหมด ฿${formatBaht(rent + fee + deposit)}</div>`;
        })()
      : 'เลือกช่วงวันที่ถูกต้อง';
  };
  form.start.addEventListener('change',()=>{form.end.min=form.start.value;if(form.end.value<form.start.value)form.end.value=form.start.value;updateEstimate();});
  form.end.addEventListener('change',updateEstimate);
  updateEstimate();
  if (liveMode) initMeetingPicker('booking', { center:toPoint(item.latitude, item.longitude) });
  if (liveMode && currentSession?.user) {
    const renterId = currentSession.user.id;
    void supabase.from('profile_contacts').select('phone').eq('user_id', renterId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (!/does not exist|schema cache/i.test(error.message || '')) console.warn('โหลดเบอร์ติดต่อส่วนตัวไม่สำเร็จ', error);
          return;
        }
        const phoneInput = $('#bookingForm input[name="contact_phone"]');
        if (currentSession?.user?.id === renterId && phoneInput && !phoneInput.value) phoneInput.value = data?.phone || '';
      }).catch(error => console.warn('โหลดเบอร์ติดต่อส่วนตัวไม่สำเร็จ', error));
  }
}
function openRequestForm() {
  if (liveMode && !currentSession?.user) { openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนแจ้งสิ่งที่ต้องการ'); }
  const minDate = addDateDays(formatDateInput(), 1);
  openModal('แจ้งสิ่งที่ต้องการ','เผยแพร่ความต้องการให้นักศึกษาคนอื่นเสนอสินค้าได้',`<form id="requestForm"><div class="form-grid">
    <div class="form-field full"><label for="requestTitle">ต้องการเช่าอะไร? *</label><input id="requestTitle" name="title" required maxlength="100" placeholder="เช่น ไมโครโฟนไร้สายสำหรับถ่ายวิดีโอ"></div>
    <div class="form-field"><label for="requestCategory">หมวดหมู่ *</label><select id="requestCategory" name="category" required><option value="media">ถ่ายภาพและวิดีโอ</option><option value="study">เรียนและโปรเจกต์</option><option value="event">กิจกรรมและอีเวนต์</option><option value="fashion">เสื้อผ้าและโอกาสพิเศษ</option><option value="other">อื่น ๆ</option></select></div>
    <div class="form-field"><label for="requestBudget">งบประมาณต่อวัน (บาท) *</label><input id="requestBudget" name="budget" type="number" min="1" max="100000" required placeholder="เช่น 150"></div>
    <div class="form-field"><label for="requestStart">วันที่ต้องการใช้ *</label><input id="requestStart" name="date" type="date" min="${minDate}" required value="${minDate}"></div>
    <div class="form-field"><label for="requestDuration">ระยะเวลา *</label><input id="requestDuration" name="duration" type="text" required maxlength="80" placeholder="เช่น 1–2 วัน, 1 สัปดาห์ หรือเฉพาะวันเสาร์–อาทิตย์"></div>
    <div class="form-field full"><label for="requestPickup">โซนรับของที่สะดวก *</label><input id="requestPickup" name="pickup" required maxlength="100" placeholder="เช่น ใกล้คณะวิศวกรรมศาสตร์"></div>
    <div class="form-field full"><label for="requestDetails">รายละเอียดเพิ่มเติม</label><textarea id="requestDetails" name="note" maxlength="500" placeholder="เช่น ต้องการอุปกรณ์ครบชุด หรือมีเงื่อนไขเพิ่มเติม"></textarea></div>
  </div><p class="form-footnote">อย่าใส่ข้อมูลส่วนตัวที่สำคัญในประกาศที่ผู้อื่นมองเห็นได้</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">เผยแพร่ความต้องการ</button></div></form>`);
}
async function openListingForm(listingId = null) {
  if (liveMode && !currentSession?.user) { openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนลงประกาศ'); }
  const mode = listingId ? 'edit' : 'create';
  let editItem = null;
  if (mode === 'edit') {
    if (typeof listingId !== 'string' || !listingId.trim()) return showToast('รหัสประกาศสำหรับแก้ไขไม่ถูกต้อง');
    if (liveMode) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) {
        return showToast('รหัสประกาศสำหรับแก้ไขไม่ถูกต้อง');
      }
      try {
        const { data, error } = await supabase.from('listings')
          .select('*, profiles!listings_owner_id_fkey(full_name)')
          .eq('id', listingId).maybeSingle();
        if (error) return showToast('โหลดประกาศเพื่อแก้ไขไม่สำเร็จ: ' + friendlyError(error));
        if (!data) return showToast('ไม่พบประกาศที่ต้องการแก้ไข');
        editItem = fromDbListing(data);
      } catch (error) {
        return showToast('โหลดประกาศเพื่อแก้ไขไม่สำเร็จ: ' + friendlyError(error));
      }
    } else {
      editItem = getListings().find(item => item.id === listingId) || null;
      if (!editItem) return showToast('ไม่พบประกาศที่ต้องการแก้ไข');
    }
  }
  if (editItem && currentSession?.user?.id !== editItem.owner_id && !currentIsAdmin) return showToast('คุณไม่มีสิทธิ์แก้ไขประกาศนี้');
  const ownerDefault = liveMode ? (currentSession.user.user_metadata?.full_name || currentSession.user.email?.split('@')[0] || '') : '';
  const categories = ['media','study','event','fashion','other'].map(category => `<option value="${category}" ${editItem?.category===category?'selected':''}>${escapeHTML(categoryLabels[category])}</option>`).join('');
  openModal(mode === 'edit' ? 'แก้ไขประกาศ' : 'ลงประกาศปล่อยเช่า',liveMode?'ประกาศจะบันทึกลงฐานข้อมูลและแสดงให้ผู้ใช้คนอื่นค้นหาได้':'เพิ่มรายการตัวอย่างเพื่อทดลองหน้าประกาศ',`<form id="listingForm" data-mode="${mode}" data-id="${escapeHTML(editItem?.id || '')}" data-image-path="${escapeHTML(editItem?.image_path || '')}"><div class="form-grid">
    <div class="form-field full"><label for="newTitle">ชื่อสิ่งของ *</label><input id="newTitle" name="title" required minlength="2" maxlength="100" value="${escapeHTML(editItem?.title || '')}" placeholder="เช่น ขาตั้งกล้องพร้อมหัวจับ"></div>
    <div class="form-field"><label for="newCategory">หมวดหมู่ *</label><select id="newCategory" name="category" required>${categories}</select></div>
    <div class="form-field"><label for="newPrice">ค่าเช่าต่อวัน (บาท) *</label><input id="newPrice" name="price" type="number" min="1" max="100000" required value="${editItem?.price ?? ''}" placeholder="เช่น 100"></div>
    <div class="form-field"><label for="newDeposit">เงินมัดจำ (บาท) <span class="hint">(ไม่บังคับ)</span></label><input id="newDeposit" name="deposit" type="number" min="0" max="1000000" value="${editItem?.deposit ?? ''}" placeholder="เว้นว่างหากไม่มีเงินมัดจำ"></div>
    <div class="form-field"><label for="newOwner">ชื่อที่แสดง <span class="hint">(ไม่บังคับ)</span></label><input id="newOwner" name="owner" maxlength="30" value="${escapeHTML(editItem?.owner || ownerDefault)}" ${liveMode?'readonly':''} placeholder="เช่น มายด์"><span class="hint">${liveMode?'ใช้ชื่อจากบัญชีที่สมัครไว้':'ชื่อเจ้าของในข้อมูลตัวอย่าง'}</span></div>
    <div class="form-field full"><label for="newLocation">โซนนัดรับโดยประมาณ <span class="hint">(ไม่บังคับ)</span></label><input id="newLocation" name="location" maxlength="100" value="${escapeHTML(editItem?.location || '')}" placeholder="เช่น อาคารกิจกรรมนักศึกษา"></div>
    ${addressFieldsMarkup(editItem)}
    ${liveMode?`<input id="newLatitude" name="latitude" type="hidden" value="${editItem?.latitude ?? ''}"><input id="newLongitude" name="longitude" type="hidden" value="${editItem?.longitude ?? ''}"><div class="form-field full"><div class="address-locate-row"><button type="button" class="btn btn-secondary btn-small" data-action="locate-address">📍 หาตำแหน่งจากที่อยู่</button><small id="addressLocateStatus" aria-live="polite">กรอกที่อยู่แล้วระบบจะปักหมุดให้อัตโนมัติ แตะแผนที่เพื่อปรับหมุดได้</small></div><div id="locationPicker" class="location-picker" aria-label="แผนที่ตำแหน่งจากที่อยู่"></div><span class="hint">ที่อยู่และหมุดนี้จะแสดงในหน้าประกาศ ระบบไม่ขอตำแหน่งอุปกรณ์ของคุณ</span></div>`:''}
    <div class="form-field full"><label for="newCondition">สภาพของ <span class="hint">(ไม่บังคับ)</span></label><input id="newCondition" name="condition" maxlength="120" value="${escapeHTML(editItem?.condition || '')}" placeholder="เช่น ใช้งานปกติ มีรอยเล็กน้อย"></div>
    <div class="form-field full"><label for="newDescription">รายละเอียด / อุปกรณ์ที่ให้มาด้วย <span class="hint">(ไม่บังคับ)</span></label><textarea id="newDescription" name="description" maxlength="500" placeholder="แจ้งตำหนิ เงื่อนไข และสิ่งที่ต้องตรวจสอบก่อนรับของ">${escapeHTML(editItem?.description || '')}</textarea></div>
    <div class="form-field full"><label for="newImage">อัปโหลดรูปภาพ (ไม่บังคับ)</label><input id="newImage" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${liveMode?'':'disabled'}><span class="hint">ไฟล์ JPG, PNG, WebP หรือ GIF · ขนาดไม่เกิน 5 MB · อัปโหลดเก็บไว้ใน Supabase Storage</span>${liveMode?'':'<span class="hint">ตั้งค่า Supabase ใน .env.local ก่อนใช้งานอัปโหลด</span>'}</div>
  </div><p class="form-footnote">ผู้ลงประกาศรับผิดชอบข้อมูล ราคา เงื่อนไข และความปลอดภัยในการส่งมอบสินค้า</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">${mode === 'edit'?'บันทึกการแก้ไข':liveMode?'บันทึกประกาศ':'เพิ่มรายการตัวอย่าง'}</button></div></form>`);
  if (liveMode) { initializeLocationPicker(editItem); initAddressAutoLocate(); }
}
function listingAddressText(item) {
  return String(item?.addressText || '').trim() || formatThaiAddress(item?.address || {});
}
function addressFieldsMarkup(editItem) {
  return `<div class="form-field full"><label for="addr_full">ที่อยู่ที่นัดรับ <span class="hint">(ไม่บังคับ)</span></label><textarea id="addr_full" name="address_text" rows="2" maxlength="300" placeholder="เช่น 99/1 หมู่ 4 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี">${escapeHTML(listingAddressText(editItem))}</textarea></div>`;
}
function readAddressFields(scope = document) {
  const full = String(scope.querySelector('#addr_full')?.value || '').replace(/\s+/g, ' ').trim();
  return { full, parsed:parseThaiAddress(full) };
}
let addressLocateTimer = null;
let addressLocateController = null;
let lastLocatedAddress = '';
async function locateAddressOnMap(force = false) {
  const status = $('#addressLocateStatus');
  const address = readAddressFields();
  const key = address.full;
  if (key.length < 4) { if (force && status) status.textContent = 'กรอกที่อยู่ก่อน เช่น ตำบล อำเภอ จังหวัด'; return; }
  if (!force && key === lastLocatedAddress) return;
  addressLocateController?.abort();
  const controller = new AbortController();
  addressLocateController = controller;
  if (status) status.textContent = 'กำลังค้นหาตำแหน่งจากที่อยู่…';
  try {
    const hit = await geocodeFreeTextAddress(address.full, { signal:controller.signal });
    if (controller.signal.aborted || !$('#locationPicker')) return;
    if (!hit) { if (status) status.textContent = 'ไม่พบตำแหน่งจากที่อยู่นี้ ลองตรวจตัวสะกด หรือแตะแผนที่เพื่อปักหมุดเอง'; return; }
    lastLocatedAddress = key;
    const lat = $('#newLatitude'); const lng = $('#newLongitude');
    lat.value = hit.lat.toFixed(6); lng.value = hit.lng.toFixed(6);
    lat.dispatchEvent(new Event('change')); lng.dispatchEvent(new Event('change'));
    locationPickerMap?.setView([hit.lat, hit.lng], hit.zoom);
    const levelText = { house:'ตามบ้านเลขที่/หมู่', subdistrict:'ระดับตำบล', district:'ระดับอำเภอ', province:'ระดับจังหวัด' }[hit.level];
    if (status) status.textContent = `ปักหมุดแล้ว (${levelText}) · แตะหรือลากหมุดเพื่อปรับให้ตรงจุด`;
  } catch (error) {
    if (controller.signal.aborted) return;
    console.warn('ค้นหาตำแหน่งจากที่อยู่ไม่สำเร็จ', error);
    if (status) status.textContent = 'ค้นหาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง หรือแตะแผนที่เพื่อปักหมุดเอง';
  }
}
function initAddressAutoLocate() {
  lastLocatedAddress = readAddressFields().full;
  $('#addr_full')?.addEventListener('input', () => {
    clearTimeout(addressLocateTimer);
    addressLocateTimer = setTimeout(() => void locateAddressOnMap(false), 1500);
  });
}
async function handleRequestSubmit(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if(!data.title.trim() || !data.date || Number(data.budget)<=0 || !data.pickup.trim()) return showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
  if (liveMode) {
    if (!currentSession?.user) return openAuthModal('login');
    const { error } = await supabase.from('wanted_requests').insert({
      owner_id:currentSession.user.id,
      title:data.title.trim(),
      category:data.category,
      budget_per_day:Number(data.budget),
      requested_date:data.date,
      duration:data.duration,
      pickup_zone:data.pickup.trim(),
      details:data.note?.trim() || ''
    });
    if (error) return showToast('เผยแพร่ความต้องการไม่สำเร็จ: ' + friendlyError(error));
    closeModal();
    showToast('เผยแพร่ความต้องการแล้ว นักศึกษาคนอื่นส่งข้อเสนอได้');
    await refreshWantedRequests();
    return;
  }
  const requests=readStore(STORAGE.requests,[]); requests.unshift({...data,id:'req-'+Date.now(),createdAt:new Date().toISOString(),status:'บันทึกในเดโม'}); writeStore(STORAGE.requests,requests); closeModal(); showToast('บันทึกความต้องการในเบราว์เซอร์นี้แล้ว');
}

let wantedRequestCache = [];
async function refreshWantedRequests() {
  const container = $('#wantedRequestsList');
  if (!container) return;
  if (!liveMode) {
    container.innerHTML = '<div class="account-empty">เชื่อมต่อ Supabase เพื่อเผยแพร่และดูความต้องการของนักศึกษาคนอื่น</div>';
    return;
  }
  const { data, error } = await supabase.from('wanted_requests')
    .select('id,owner_id,title,category,budget_per_day,requested_date,duration,pickup_zone,details,created_at,profiles!wanted_requests_owner_id_fkey(full_name)')
    .eq('status', 'open')
    .order('created_at', { ascending:false })
    .limit(30);
  if (error) {
    console.error('โหลดความต้องการไม่สำเร็จ', error);
    container.innerHTML = `<div class="account-empty">โหลดความต้องการไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  wantedRequestCache = data || [];
  if (!wantedRequestCache.length) {
    container.innerHTML = '<div class="account-empty">ยังไม่มีความต้องการที่เปิดรับข้อเสนอ</div>';
    return;
  }
  container.innerHTML = wantedRequestCache.map(request => `<article class="wanted-card">
    <div class="wanted-card-meta"><span>${escapeHTML(categoryLabels[request.category] || 'อื่น ๆ')}</span><time>${formatDateThai(String(request.created_at || '').slice(0,10))}</time></div>
    <h3>${escapeHTML(request.title)}</h3><p>${escapeHTML(request.details || 'ยังไม่มีรายละเอียดเพิ่มเติม')}</p>
    <dl><div><dt>งบต่อวัน</dt><dd>฿${formatBaht(request.budget_per_day)}</dd></div><div><dt>วันที่ต้องการ</dt><dd>${formatDateThai(request.requested_date)} · ${escapeHTML(request.duration)}</dd></div><div><dt>โซนรับ</dt><dd>${escapeHTML(request.pickup_zone)}</dd></div></dl>
    <div class="wanted-card-footer"><span>โดย ${escapeHTML(request.profiles?.full_name || 'สมาชิก')}</span>${request.owner_id === currentSession?.user?.id ? '<span class="status-pill">คำขอของคุณ</span>' : `<button class="btn btn-primary" data-action="offer-request" data-id="${escapeHTML(request.id)}">ส่งข้อเสนอ</button>`}</div>
  </article>`).join('');
}

async function openOfferForm(requestId) {
  if (!currentSession?.user) { openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนส่งข้อเสนอ'); }
  const request = wantedRequestCache.find(item => item.id === requestId);
  if (!request) return showToast('ไม่พบความต้องการนี้ กรุณาโหลดรายการใหม่');
  if (request.owner_id === currentSession.user.id) return showToast('คุณไม่สามารถส่งข้อเสนอให้คำขอของตัวเองได้');
  const { data:listings, error } = await supabase.from('listings')
    .select('id,title,price_per_day')
    .eq('owner_id', currentSession.user.id)
    .eq('is_available', true)
    .order('created_at', { ascending:false });
  if (error) return showToast('โหลดประกาศของคุณไม่สำเร็จ: ' + friendlyError(error));
  const options = (listings || []).map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)} · ฿${formatBaht(item.price_per_day)}/วัน</option>`).join('');
  openModal('ส่งข้อเสนอ', `สำหรับ: ${request.title}`, `<form id="offerForm" data-id="${escapeHTML(request.id)}">
    <div class="form-field"><label for="offerListing">ประกาศสินค้าที่เกี่ยวข้อง (ไม่บังคับ)</label><select id="offerListing" name="listing_id"><option value="">ยังไม่มีประกาศสินค้า</option>${options}</select><span class="hint">เลือกได้เฉพาะประกาศที่คุณเป็นเจ้าของและเปิดให้เช่า</span></div>
    <div class="form-field"><label for="offerMessage">ข้อความถึงผู้ตามหา *</label><textarea id="offerMessage" name="message" required maxlength="500" placeholder="แจ้งรายละเอียดสินค้าและเงื่อนไขที่เสนอ"></textarea></div>
    <div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button class="btn btn-primary" type="submit">ส่งข้อเสนอ</button></div>
  </form>`);
}

async function handleOfferSubmit(form) {
  if (!currentSession?.user) return openAuthModal('login');
  const data = Object.fromEntries(new FormData(form).entries());
  const { error } = await supabase.from('wanted_offers').insert({
    wanted_request_id:form.dataset.id,
    offerer_id:currentSession.user.id,
    listing_id:data.listing_id || null,
    message:data.message.trim()
  });
  if (error) return showToast('ส่งข้อเสนอไม่สำเร็จ: ' + friendlyError(error));
  closeModal();
  showToast('ส่งข้อเสนอแล้ว เจ้าของคำขอจะได้รับแจ้งเตือน');
}

async function importLegacyWantedRequests(userId) {
  if (!userId) return;
  const saved = readStore(STORAGE.requests, []);
  if (!Array.isArray(saved) || !saved.length) return;
  const key = `csh_wanted_imported_${userId}`;
  const imported = new Set(readStore(key, []));
  const pending = saved.filter(item => item?.id && !imported.has(item.id) && item.title && item.date && item.pickup);
  if (!pending.length) return;
  const { error } = await supabase.from('wanted_requests').insert(pending.map(item => ({
    owner_id:userId,
    title:String(item.title).slice(0,100),
    category:categoryLabels[item.category] ? item.category : 'other',
    budget_per_day:Number(item.budget),
    requested_date:item.date,
    duration:String(item.duration || 'ไม่ระบุ').slice(0,80),
    pickup_zone:String(item.pickup).slice(0,100),
    details:String(item.note || item.contact || '').slice(0,500)
  })));
  if (error) {
    console.warn('นำเข้าความต้องการเดิมไม่สำเร็จ', error);
    showToast('นำเข้าความต้องการเดิมไม่สำเร็จ: ' + friendlyError(error));
    return;
  }
  writeStore(key, [...imported, ...pending.map(item => item.id)]);
  showToast(`นำเข้าความต้องการเดิม ${pending.length} รายการแล้ว โดยยังเก็บข้อมูลต้นฉบับไว้ในเครื่อง`);
  await refreshWantedRequests();
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Bangkok' });
}
function notificationGroupLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ก่อนหน้านี้';
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0,0,0,0);
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDifference === 0) return 'วันนี้';
  if (dayDifference === 1) return 'เมื่อวาน';
  return date.toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' });
}

async function openConversationForListing(listingId) {
  if (!currentSession?.user) { openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนเริ่มแชต'); }
  const { data, error } = await supabase.rpc('start_listing_conversation', { p_listing_id:listingId });
  if (error) return showToast('เปิดแชตไม่สำเร็จ: ' + friendlyError(error));
  await openConversation(data.id);
}

async function openConversationForBooking(bookingId) {
  if (!currentSession?.user) { openAuthModal('login'); return showToast('เข้าสู่ระบบก่อนเริ่มแชต'); }
  const { data, error } = await supabase.rpc('start_booking_conversation', { p_booking_id:bookingId });
  if (error) return showToast('เปิดแชตจากการจองไม่สำเร็จ: ' + friendlyError(error));
  await openConversation(data.id);
}

async function loadConversationMessages(conversationId) {
  if (!currentSession?.user || activeConversation !== conversationId) return;
  const messages = $('#messageList');
  if (!messages) return;
  let { data, error } = await supabase.from('messages')
    .select('id,sender_id,body,created_at,message_type,image_path,listing_id,wanted_request_id,profiles!messages_sender_id_fkey(full_name)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending:true })
    .limit(100);
  if (error && isChatAttachmentSchemaMissing(error)) {
    console.warn('ยังไม่ได้ใช้ migration สำหรับไฟล์แนบแชต กำลังโหลดเฉพาะข้อความเดิม', error);
    const legacy = await supabase.from('messages')
      .select('id,sender_id,body,created_at,profiles!messages_sender_id_fkey(full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending:true })
      .limit(100);
    data = (legacy.data || []).map(message => ({...message, message_type:'text'}));
    error = legacy.error;
  }
  if (error) {
    messages.innerHTML = `<div class="account-empty">โหลดข้อความไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  if (!data?.length) {
    messages.innerHTML = '<div class="account-empty">เริ่มบทสนทนาได้ด้วยการส่งข้อความ</div>';
    return;
  }
  const listingIds = [...new Set(data.map(message => message.listing_id).filter(Boolean))];
  const requestIds = [...new Set(data.map(message => message.wanted_request_id).filter(Boolean))];
  const imagePaths = [...new Set(data.map(message => message.image_path).filter(Boolean))];
  const pathsNeedingSignatures = imagePaths.filter(path => (chatSignedUrlCache.get(path)?.expiresAt || 0) < Date.now() + 60000);
  const [listingsResult, requestsResult, imagesResult] = await Promise.all([
    listingIds.length ? supabase.from('listings').select('id,title,category,price_per_day,location,image_url').in('id', listingIds) : Promise.resolve({ data: [], error: null }),
    requestIds.length ? supabase.from('wanted_requests').select('id,title,category,budget_per_day,requested_date,duration,pickup_zone,details,status').in('id', requestIds) : Promise.resolve({ data: [], error: null }),
    pathsNeedingSignatures.length ? supabase.storage.from(CHAT_IMAGE_BUCKET).createSignedUrls(pathsNeedingSignatures, 3600) : Promise.resolve({ data: [], error: null })
  ]);
  if (listingsResult.error) console.warn('โหลดประกาศที่แชร์ในแชตไม่สำเร็จ', listingsResult.error);
  if (requestsResult.error) console.warn('โหลดความต้องการที่แชร์ในแชตไม่สำเร็จ', requestsResult.error);
  if (imagesResult.error) console.warn('สร้างลิงก์รูปแชตไม่สำเร็จ', imagesResult.error);
  const listings = new Map((listingsResult.data || []).map(item => [item.id, item]));
  const requests = new Map((requestsResult.data || []).map(item => [item.id, item]));
  for (const item of imagesResult.data || []) {
    if (item.signedUrl) chatSignedUrlCache.set(item.path, { url:item.signedUrl, expiresAt:Date.now() + 3500 * 1000 });
  }
  const signedImages = new Map(imagePaths.map(path => [path, chatSignedUrlCache.get(path)]).filter(([,entry]) => entry?.expiresAt > Date.now()).map(([path,entry]) => [path,entry.url]));
  messages.innerHTML = data.map(message => {
    const type = message.message_type || 'text';
    let attachment = '';
    if (type === 'image') {
      const url = signedImages.get(message.image_path);
      attachment = url
        ? `<img class="message-image" src="${escapeHTML(url)}" alt="รูปภาพที่แชร์ในแชต" loading="lazy">`
        : '<p class="message-unavailable">ไม่สามารถโหลดรูปภาพนี้ได้</p>';
    } else if (type === 'listing') {
      const item = listings.get(message.listing_id);
      attachment = item
        ? `<button class="shared-item-card" type="button" data-action="shared-listing-detail" data-id="${escapeHTML(item.id)}">${item.image_url ? `<img src="${escapeHTML(item.image_url)}" alt="" loading="lazy">` : ''}<span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(categoryLabels[item.category] || 'รายการ')} · ฿${formatBaht(item.price_per_day)} / วัน</small><small>${escapeHTML(item.location || 'ยังไม่ได้ระบุตำแหน่ง')}</small></span></button>`
        : '<p class="message-unavailable">ประกาศนี้ไม่มีให้ดูแล้ว</p>';
    } else if (type === 'wanted_request') {
      const request = requests.get(message.wanted_request_id);
      attachment = request
        ? `<button class="shared-item-card" type="button" data-action="shared-request-detail" data-id="${escapeHTML(request.id)}"><span><strong>${escapeHTML(request.title)}</strong><small>${escapeHTML(categoryLabels[request.category] || 'อื่น ๆ')} · งบ ฿${formatBaht(request.budget_per_day)} / วัน</small><small>${formatDateThai(request.requested_date)} · ${escapeHTML(request.duration || 'ยังไม่ได้ระบุระยะเวลา')}</small></span></button>`
        : '<p class="message-unavailable">ความต้องการนี้ปิดหรือไม่มีให้ดูแล้ว</p>';
    }
    return `<article class="message ${message.sender_id === currentSession.user.id ? 'mine' : ''}">
      <div class="message-meta"><strong>${escapeHTML(message.profiles?.full_name || 'สมาชิก')}</strong><time>${formatTime(message.created_at)}</time></div>
      ${attachment}${message.body ? `<p>${escapeHTML(message.body)}</p>` : ''}
    </article>`;
  }).join('');
  messages.scrollTop = messages.scrollHeight;
}

async function openConversation(conversationId) {
  if (!currentSession?.user) return openAuthModal('login');
  const { data:conversation, error } = await supabase.from('conversations')
    .select('id,listing_id,requester_id,owner_id,listings!conversations_listing_id_fkey(title)')
    .eq('id', conversationId).maybeSingle();
  if (error) return showToast('โหลดบทสนทนาไม่สำเร็จ: ' + friendlyError(error));
  if (!conversation) return showToast('ไม่พบบทสนทนานี้หรือคุณไม่มีสิทธิ์เข้าถึง');
  const participantId = conversation.requester_id === currentSession.user.id ? conversation.owner_id : conversation.requester_id;
  const { data:profile, error:profileError } = await supabase.from('profiles')
    .select('full_name').eq('id', participantId).maybeSingle();
  if (profileError) return showToast('โหลดข้อมูลคู่สนทนาไม่สำเร็จ: ' + friendlyError(profileError));
  closeModal();
  closeChatDock();
  activeConversation = conversationId;
  $('#chatDockTitle').textContent = profile?.full_name || 'สมาชิก';
  $('#chatDockSubtitle').textContent = conversation.listings?.title || 'บทสนทนาเกี่ยวกับประกาศ';
  $('#chatDock').hidden = false;
  $('#messageList').innerHTML = '<div class="account-empty">กำลังโหลดข้อความ…</div>';
  $('#messageForm').dataset.id = conversationId;
  const { error:readError } = await supabase.rpc('mark_conversation_read', { p_conversation_id:conversationId });
  if (readError) console.warn('ทำเครื่องหมายแชตว่าอ่านแล้วไม่สำเร็จ', readError);
  await loadConversationMessages(conversationId);
  await refreshConversationList();
  if (conversationChannel) await supabase.removeChannel(conversationChannel);
  conversationChannel = supabase.channel(`conversation-${conversationId}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${conversationId}` }, () => {
      void loadConversationMessages(conversationId);
      void supabase.rpc('mark_conversation_read', { p_conversation_id:conversationId });
      void refreshConversationList();
    })
    .subscribe();
  if (conversationRecoveryTimer) clearInterval(conversationRecoveryTimer);
  conversationRecoveryTimer = setInterval(() => {
    if (activeConversation === conversationId) void loadConversationMessages(conversationId);
  }, 12000);
}

async function sendMessage(form) {
  if (!currentSession?.user) return openAuthModal('login');
  const formData = new FormData(form);
  const body = String(formData.get('body') || '').trim();
  const file = formData.get('image');
  if (!body && !(file instanceof File && file.size)) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  let imagePath = null;
  try {
    if (file instanceof File && file.size) imagePath = await uploadConversationImage(file, form.dataset.id);
    const message = {
      conversation_id:form.dataset.id,
      sender_id:currentSession.user.id,
      body:body || (imagePath ? 'ส่งรูปภาพ' : ''),
      message_type:imagePath ? 'image' : 'text',
      image_path:imagePath
    };
    let { error } = await supabase.from('messages').insert(message);
    if (error && !imagePath && body && isChatAttachmentSchemaMissing(error)) {
      console.warn('ยังไม่ได้ใช้ migration สำหรับไฟล์แนบแชต กำลังส่งเป็นข้อความเดิม', error);
      ({ error } = await supabase.from('messages').insert({
        conversation_id:message.conversation_id,
        sender_id:message.sender_id,
        body:message.body
      }));
    }
    if (error) throw error;
  } catch (error) {
    if (imagePath) {
      const { error:removeError } = await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath]);
      if (removeError) console.error('ลบรูปที่ส่งข้อความไม่สำเร็จ', removeError);
    }
    button.disabled = false;
    return showToast('ส่งข้อความไม่สำเร็จ: ' + friendlyError(error));
  }
  button.disabled = false;
  form.reset();
  clearMessageImagePreview();
  await loadConversationMessages(form.dataset.id);
  await refreshNotificationCount();
}

async function openSharePicker() {
  if (!currentSession?.user) return openAuthModal('login');
  const [listingResult, requestResult] = await Promise.all([
    supabase.from('listings').select('id,title,category,price_per_day,location,image_url').eq('owner_id', currentSession.user.id).order('created_at', { ascending:false }),
    supabase.from('wanted_requests').select('id,title,category,budget_per_day,requested_date,duration,pickup_zone,details,status').or(`owner_id.eq.${currentSession.user.id},status.eq.open`).order('created_at', { ascending:false })
  ]);
  if (listingResult.error) return showToast('โหลดประกาศเพื่อแชร์ไม่สำเร็จ: ' + friendlyError(listingResult.error));
  if (requestResult.error) return showToast('โหลดความต้องการเพื่อแชร์ไม่สำเร็จ: ' + friendlyError(requestResult.error));
  const choices = [
    ...(listingResult.data || []).map(item => ({...item, shareType:'listing'})),
    ...(requestResult.data || []).map(item => ({...item, shareType:'wanted_request'}))
  ];
  const content = choices.length ? `<div class="share-choice-list">${choices.map(item => `<button type="button" class="share-choice" data-action="share-chat-item" data-type="${item.shareType}" data-id="${escapeHTML(item.id)}"><strong>${escapeHTML(item.title)}</strong><small>${item.shareType === 'listing' ? `ประกาศของคุณ · ฿${formatBaht(item.price_per_day)} / วัน` : `ความต้องการ · งบ ฿${formatBaht(item.budget_per_day)} / วัน`}</small></button>`).join('')}</div>` : '<div class="account-empty">ยังไม่มีประกาศหรือความต้องการที่แชร์ได้</div>';
  chatShareChoices = choices;
  openModal('แชร์รายการในแชต', 'เลือกประกาศหรือความต้องการจากข้อมูลจริงในระบบ', content);
}

async function shareChatItem(type, id) {
  const item = chatShareChoices.find(choice => choice.id === id && choice.shareType === type);
  if (!item || !activeConversation || !currentSession?.user) return showToast('ไม่พบรายการสำหรับแชร์ กรุณาเปิดรายการใหม่');
  const body = item.title;
  const { error } = await supabase.from('messages').insert({
    conversation_id:activeConversation,
    sender_id:currentSession.user.id,
    body,
    message_type:type,
    listing_id:type === 'listing' ? id : null,
    wanted_request_id:type === 'wanted_request' ? id : null
  });
  if (error) return showToast('แชร์รายการไม่สำเร็จ: ' + friendlyError(error));
  chatShareChoices = [];
  closeModal();
  await loadConversationMessages(activeConversation);
}

async function openSharedListing(id) {
  const { data, error } = await supabase.from('listings')
    .select('id,owner_id,title,category,description,condition,price_per_day,deposit,location,image_url,image_path,pickup_latitude,pickup_longitude,is_available,created_at,profiles!listings_owner_id_fkey(full_name)')
    .eq('id', id).maybeSingle();
  if (error) return showToast('โหลดประกาศที่แชร์ไม่สำเร็จ: ' + friendlyError(error));
  if (!data) return showToast('ประกาศนี้ไม่มีให้ดูแล้ว');
  const item = fromDbListing(data);
  const index = listingCache.findIndex(listing => listing.id === id);
  if (index >= 0) listingCache[index] = item;
  else listingCache.unshift(item);
  listingDetail(id);
}

async function openSharedRequest(id) {
  const { data, error } = await supabase.from('wanted_requests')
    .select('id,title,category,budget_per_day,requested_date,duration,pickup_zone,details,status')
    .eq('id', id).maybeSingle();
  if (error) return showToast('โหลดความต้องการที่แชร์ไม่สำเร็จ: ' + friendlyError(error));
  if (!data) return showToast('ความต้องการนี้ปิดหรือไม่มีให้ดูแล้ว');
  openModal(data.title, 'ความต้องการที่แชร์ในแชต', `<div class="shared-request-detail"><p>${escapeHTML(data.details || 'ยังไม่ได้ระบุรายละเอียด')}</p><dl><div><dt>หมวดหมู่</dt><dd>${escapeHTML(categoryLabels[data.category] || 'อื่น ๆ')}</dd></div><div><dt>งบต่อวัน</dt><dd>฿${formatBaht(data.budget_per_day)} / วัน</dd></div><div><dt>วันที่ต้องการ</dt><dd>${formatDateThai(data.requested_date)} · ${escapeHTML(data.duration || 'ยังไม่ได้ระบุระยะเวลา')}</dd></div><div><dt>โซนรับ</dt><dd>${escapeHTML(data.pickup_zone || 'ยังไม่ได้ระบุตำแหน่ง')}</dd></div></dl></div>`);
}

async function refreshConversationList() {
  const out = $('#accountContent');
  if (!currentSession?.user) return;
  const uid = currentSession.user.id;
  const { data, error } = await supabase.from('conversations')
    .select('id,listing_id,requester_id,owner_id,last_message,last_message_at,created_at,listings!conversations_listing_id_fkey(title)')
    .or(`requester_id.eq.${uid},owner_id.eq.${uid}`)
    .order('last_message_at', { ascending:false, nullsFirst:false });
  if (error) {
    if (out && accountTab === 'inbox') out.innerHTML = `<div class="account-empty">โหลดกล่องข้อความไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  const conversations = data || [];
  if (!conversations.length) {
    if (out && accountTab === 'inbox') out.innerHTML = '<div class="account-empty">ยังไม่มีบทสนทนา เริ่มจากปุ่ม “แชตกับเจ้าของ” ในหน้ารายละเอียดประกาศ</div>';
    return;
  }
  const unreadResults = await Promise.all(conversations.map(async item => {
    const result = await supabase.rpc('conversation_unread_count', { p_conversation_id:item.id });
    return { id:item.id, count:Number(result.data || 0), error:result.error };
  }));
  const unreadFailure = unreadResults.find(result => result.error);
  if (unreadFailure) {
    console.error('โหลดจำนวนข้อความที่ยังไม่อ่านไม่สำเร็จ', unreadFailure.error);
    const message = 'โหลดจำนวนข้อความที่ยังไม่อ่านไม่ได้: ' + friendlyError(unreadFailure.error);
    if (out && accountTab === 'inbox') out.innerHTML = `<div class="account-empty">${escapeHTML(message)}</div>`;
    else showToast(message);
    return;
  }
  const countById = Object.fromEntries(unreadResults.map(result => [result.id, result.count]));
  const participantIds = [...new Set(conversations.map(item => item.requester_id === uid ? item.owner_id : item.requester_id))];
  const { data:profiles, error:profileError } = await supabase.from('profiles').select('id,full_name').in('id', participantIds);
  if (profileError) {
    if (out && accountTab === 'inbox') out.innerHTML = `<div class="account-empty">โหลดชื่อผู้สนทนาไม่ได้: ${escapeHTML(friendlyError(profileError))}</div>`;
    return;
  }
  const names = Object.fromEntries((profiles || []).map(profile => [profile.id, profile.full_name]));
  if (out && accountTab === 'inbox') out.innerHTML = `<div class="account-list">${conversations.map(item => {
    const other = item.requester_id === uid ? item.owner_id : item.requester_id;
    const unread = countById[item.id] || 0;
    return `<button class="conversation-row ${unread?'unread':''}" data-action="open-conversation" data-id="${escapeHTML(item.id)}">
      <span class="conversation-initial">${escapeHTML((names[other] || 'ส').slice(0,1))}</span>
      <span class="conversation-copy"><strong>${escapeHTML(names[other] || 'สมาชิก')}</strong><small>${escapeHTML(item.listings?.title || 'ประกาศ')}</small><span>${escapeHTML(item.last_message || 'เริ่มการสนทนา')}</span></span>
      <span class="conversation-side"><time>${formatTime(item.last_message_at || item.created_at)}</time>${unread?`<b>${unread}</b>`:''}</span>
    </button>`;
  }).join('')}</div>`;
}

async function openInbox() {
  if (!currentSession?.user) return openAuthModal('login');
  accountTab = 'inbox';
  openModal('ข้อความ', 'บทสนทนาส่วนตัวเกี่ยวกับประกาศเช่า', `<div id="accountContent"><div class="account-empty">กำลังโหลดข้อความ…</div></div>`, true);
  await refreshConversationList();
}

async function refreshNotificationCount(showError = false) {
  if (!currentSession?.user) return;
  const { count, error } = await supabase.from('notifications')
    .select('id', { count:'exact', head:true })
    .eq('recipient_id', currentSession.user.id)
    .is('read_at', null);
  if (error) {
    console.error('โหลดจำนวนแจ้งเตือนไม่สำเร็จ', error);
    if (showError) showToast('โหลดการแจ้งเตือนไม่สำเร็จ: ' + friendlyError(error));
    return;
  }
  const badge = $('#notificationCount');
  const unreadCount = Number(count || 0);
  badge.dataset.unread = String(unreadCount);
  badge.textContent = String(unreadCount);
  badge.hidden = unreadCount === 0;
}

async function openNotifications() {
  if (!currentSession?.user) return openAuthModal('login');
  openModal('การแจ้งเตือน', 'อัปเดตเกี่ยวกับการจอง แชต และข้อเสนอ', '<div id="notificationList"><div class="account-empty">กำลังโหลดการแจ้งเตือน…</div></div>', true);
  const list = $('#notificationList');
  const { data, error } = await supabase.from('notifications')
    .select('id,actor_id,kind,title,body,link_type,link_id,read_at,created_at')
    .eq('recipient_id', currentSession.user.id)
    .order('created_at', { ascending:false }).range(0, NOTIFICATION_PAGE_SIZE - 1);
  if (error) {
    list.innerHTML = `<div class="account-empty">โหลดการแจ้งเตือนไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  notificationCache = data || [];
  notificationOffset = notificationCache.length;
  renderNotificationPanel(notificationCache.length === NOTIFICATION_PAGE_SIZE);
  await refreshNotificationCount();
}

function renderNotificationPanel(hasMore) {
  const list = $('#notificationList');
  if (!list) return;
  const unread = notificationCache.filter(item => !item.read_at);
  const groups = [];
  for (const item of notificationCache) {
    const label = notificationGroupLabel(item.created_at);
    let group = groups.find(entry => entry.label === label);
    if (!group) { group = { label, items:[] }; groups.push(group); }
    group.items.push(item);
  }
  list.innerHTML = `<div class="notification-actions"><span>${unread.length} รายการยังไม่อ่าน · แสดง ${notificationCache.length} รายการ</span><button class="btn btn-secondary" data-action="mark-notifications-read" ${unread.length?'':'disabled'}>ทำเครื่องหมายว่าอ่านทั้งหมด</button></div>${notificationCache.length ? `<div class="notification-groups">${groups.map(group => `<section><h3>${escapeHTML(group.label)}</h3><div class="notification-list">${group.items.map(item => `<button class="notification-item ${item.read_at?'':'unread'}" data-action="notification-link" data-id="${escapeHTML(item.id)}">
    <span class="notification-dot" aria-hidden="true"></span><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.body)}</small><time>${formatTime(item.created_at)}</time></span>
  </button>`).join('')}</div></section>`).join('')}</div>${hasMore?'<button class="btn btn-secondary notification-more" data-action="load-more-notifications">โหลดการแจ้งเตือนเก่ากว่า</button>':''}` : '<div class="account-empty">ยังไม่มีการแจ้งเตือน</div>'}`;
}

async function loadMoreNotifications() {
  if (!currentSession?.user) return;
  const { data, error } = await supabase.from('notifications')
    .select('id,actor_id,kind,title,body,link_type,link_id,read_at,created_at')
    .eq('recipient_id', currentSession.user.id)
    .order('created_at', { ascending:false })
    .range(notificationOffset, notificationOffset + NOTIFICATION_PAGE_SIZE - 1);
  if (error) return showToast('โหลดรายการแจ้งเตือนเพิ่มเติมไม่ได้: ' + friendlyError(error));
  notificationCache.push(...(data || []));
  notificationOffset += data?.length || 0;
  renderNotificationPanel(data?.length === NOTIFICATION_PAGE_SIZE);
}

async function markNotificationsRead() {
  if (!currentSession?.user) return;
  const { error } = await supabase.from('notifications')
    .update({ read_at:new Date().toISOString() })
    .eq('recipient_id', currentSession.user.id)
    .is('read_at', null);
  if (error) return showToast('ทำเครื่องหมายว่าอ่านแล้วไม่สำเร็จ: ' + friendlyError(error));
  showToast('ทำเครื่องหมายการแจ้งเตือนว่าอ่านแล้ว');
  await openNotifications();
}

async function openNotificationTarget(notificationId) {
  const item = notificationCache.find(notification => notification.id === notificationId);
  if (!item) return;
  const { error } = await supabase.from('notifications').update({ read_at:new Date().toISOString() })
    .eq('id', item.id).eq('recipient_id', currentSession.user.id);
  if (error) return showToast('อัปเดตการแจ้งเตือนไม่สำเร็จ: ' + friendlyError(error));
  await refreshNotificationCount();
  if (item.link_type === 'conversation') return openConversation(item.link_id);
  if (item.link_type === 'listing') { closeModal(); return listingDetail(item.link_id); }
  if (item.link_type === 'report') return openAccountDashboard(currentIsAdmin ? 'admin-reports' : 'my-reports');
  if (item.link_type === 'payment') return openAccountDashboard(currentIsAdmin ? 'admin-payments' : 'payments');
  if (item.link_type === 'review') {
    const { data:review, error:reviewError } = await supabase.from('rental_reviews').select('listing_id').eq('id', item.link_id).maybeSingle();
    if (reviewError) return showToast('เปิดรีวิวไม่ได้: ' + friendlyError(reviewError));
    if (!review) return showToast('ไม่พบรีวิวนี้');
    closeModal();
    return listingDetail(review.listing_id);
  }
  if (item.link_type === 'booking') {
    const { data:booking, error:bookingError } = await supabase.from('bookings').select('renter_id,listing_id').eq('id', item.link_id).maybeSingle();
    if (bookingError) return showToast('เปิดการจองไม่ได้: ' + friendlyError(bookingError));
    if (!booking) return showToast('ไม่พบคำขอจองนี้');
    const { data:listing, error:listingError } = await supabase.from('listings').select('owner_id').eq('id', booking.listing_id).maybeSingle();
    if (listingError) return showToast('ตรวจสอบผู้ดูแลประกาศไม่ได้: ' + friendlyError(listingError));
    return openAccountDashboard(booking.renter_id === currentSession.user.id ? 'as-renter' : listing?.owner_id === currentSession.user.id ? 'as-owner' : 'admin-bookings');
  }
  if (item.link_type === 'offer') return openOfferNotification(item.link_id, item);
  if (item.link_type === 'wanted_request') return openAccountDashboard('my-wanted');
}

async function openOfferNotification(offerId, notification = null) {
  const { data:offer, error } = await supabase.from('wanted_offers')
    .select('id,wanted_request_id,offerer_id,listing_id,message,status,created_at,profiles!wanted_offers_offerer_id_fkey(full_name),wanted_requests!wanted_offers_wanted_request_id_fkey(title,owner_id)')
    .eq('id', offerId).maybeSingle();
  if (error) return showToast('เปิดข้อเสนอไม่ได้: ' + friendlyError(error));
  if (!offer) return showToast('ไม่พบข้อเสนอนี้หรือไม่มีสิทธิ์เข้าถึง');
  let listing = null;
  if (offer.listing_id) {
    const result = await supabase.from('listings').select('id,title,owner_id').eq('id', offer.listing_id).maybeSingle();
    if (result.error) return showToast('โหลดประกาศในข้อเสนอไม่ได้: ' + friendlyError(result.error));
    listing = result.data;
  }
  const ownsRequest = offer.wanted_requests?.owner_id === currentSession.user.id;
  const controls = ownsRequest && offer.status === 'pending'
    ? `<button class="btn btn-primary" data-action="offer-accept" data-id="${escapeHTML(offer.id)}">ตอบรับข้อเสนอ</button><button class="btn btn-danger" data-action="offer-decline" data-id="${escapeHTML(offer.id)}">ปฏิเสธ</button>`
    : '';
  const offerStatus = notification?.kind === 'request_closed'
    ? 'คำขอปิดรับข้อเสนอแล้ว'
    : offer.status==='pending'?'รอตอบรับ':offer.status==='accepted'?'ตอบรับแล้ว':'ปฏิเสธแล้ว';
  openModal('รายละเอียดข้อเสนอ', offer.wanted_requests?.title || notification?.body || 'ความต้องการ', `<div class="offer-detail">
    <p><strong>ผู้เสนอ:</strong> ${escapeHTML(offer.profiles?.full_name || 'สมาชิก')}</p>
    <p><strong>ข้อความ:</strong> ${escapeHTML(offer.message)}</p>
    <p><strong>สถานะ:</strong> ${offerStatus}</p>
    ${listing?`<p><strong>ประกาศที่แนบมา:</strong> <button class="text-action" data-action="open-listing-detail" data-id="${escapeHTML(listing.id)}">${escapeHTML(listing.title)}</button></p>${ownsRequest?`<button class="btn btn-secondary" data-action="offer-chat" data-listing-id="${escapeHTML(listing.id)}">แชตกับผู้เสนอ</button>`:''}`:'<p class="form-footnote">ผู้เสนอไม่ได้แนบประกาศสินค้า จึงยังเปิดหน้าประกาศหรือเริ่มแชตจากข้อเสนอนี้ไม่ได้</p>'}
    <div class="form-actions">${controls}<button class="btn btn-secondary" data-action="close">ปิด</button></div>
  </div>`, true);
}

function startRealtime(userId) {
  if (!liveMode || !userId) return;
  realtimeChannels.forEach(channel => void supabase.removeChannel(channel));
  realtimeChannels = [];
  const notifications = supabase.channel(`notifications-${userId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'notifications', filter:`recipient_id=eq.${userId}` }, () => {
      void refreshNotificationCount();
      if ($('#notificationList') && $('#modalBackdrop').classList.contains('open') && $('#modalTitle').textContent === 'การแจ้งเตือน') {
        void openNotifications();
      }
    }).subscribe();
  realtimeChannels.push(notifications);
  if (notificationRecoveryTimer) clearInterval(notificationRecoveryTimer);
  notificationRecoveryTimer = setInterval(() => {
    if (currentSession?.user?.id === userId) void refreshNotificationCount();
  }, 20000);
  void refreshNotificationCount();
}

function stopRealtime() {
  realtimeChannels.forEach(channel => void supabase.removeChannel(channel));
  realtimeChannels = [];
  if (notificationRecoveryTimer) clearInterval(notificationRecoveryTimer);
  closeChatDock();
}
async function handleListingSubmit(form) {
  const mode = form.dataset.mode;
  if (mode !== 'create' && mode !== 'edit') return showToast('ไม่ทราบประเภทการบันทึกประกาศ กรุณาปิดแล้วเปิดฟอร์มใหม่');
  const data = Object.fromEntries(new FormData(form).entries());
  const title = String(data.title || '').trim();
  const category = String(data.category || '');
  const price = Number(data.price);
  const depositText = String(data.deposit || '').trim();
  const deposit = depositText ? Number(depositText) : 0;
  const location = String(data.location || '').trim() || null;
  const condition = String(data.condition || '').trim() || null;
  const description = String(data.description || '').trim() || null;
  const latitudeText = String(data.latitude || '').trim();
  const longitudeText = String(data.longitude || '').trim();
  const hasLatitude = latitudeText !== '';
  const hasLongitude = longitudeText !== '';
  const imageFile = data.image instanceof File && data.image.size ? data.image : null;
  const address = readAddressFields(form);
  const addressColumns = {
    address_text: address.full || null,
    ...Object.fromEntries(ADDRESS_FIELDS.map(([kind,column]) => [column, address.parsed[kind] || null]))
  };
  if (title.length < 2 || title.length > 100 || !categoryLabels[category] || !Number.isFinite(price) || price <= 0 || price > 100000) {
    return showToast('กรุณาระบุชื่อสิ่งของ หมวดหมู่ และค่าเช่าต่อวันให้ถูกต้อง');
  }
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > 1000000) return showToast('จำนวนเงินมัดจำไม่ถูกต้อง');
  if ((hasLatitude && !hasLongitude) || (!hasLatitude && hasLongitude)) return showToast('กรุณากรอกพิกัดทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่');
  if (hasLatitude) {
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return showToast('พิกัดจุดรับไม่ถูกต้อง');
    }
  }
  if (imageFile && !liveMode) return showToast('การอัปโหลดรูปถาวรต้องเชื่อมต่อ Supabase ก่อน');
  if (liveMode) {
    if (!currentSession?.user) return openAuthModal('login');
    if (mode === 'edit' && !form.dataset.id) return showToast('ไม่พบรหัสประกาศที่ต้องการแก้ไข');
    let uploaded = { url: null, path: null };
    const removeUploadedImage = async () => {
      if (!uploaded.path) return;
      const { error } = await supabase.storage.from(LISTING_IMAGE_BUCKET).remove([uploaded.path]);
      if (error) console.warn('ลบรูปที่อัปโหลดระหว่างบันทึกไม่สำเร็จ', error);
    };
    try {
      if (imageFile) uploaded = await uploadListingImage(imageFile);
      const payload = {
        title, category, price_per_day:price, deposit, location, condition, description,
        pickup_latitude:hasLatitude ? Number(latitudeText) : null,
        pickup_longitude:hasLongitude ? Number(longitudeText) : null,
        ...addressColumns
      };
      if (uploaded.url) {
        payload.image_url = uploaded.url;
        payload.image_path = uploaded.path;
      }
      let query;
      if (mode === 'edit') {
        query = supabase.from('listings').update(payload).eq('id', form.dataset.id);
        if (!currentIsAdmin) query = query.eq('owner_id', currentSession.user.id);
      } else {
        query = supabase.from('listings').insert({
          ...payload, owner_id:currentSession.user.id, image_url:uploaded.url,
          image_path:uploaded.path, is_available:true
        });
      }
      let { data: savedRow, error } = await query.select('id').maybeSingle();
      if (error && /address_(text|house_no|moo|subdistrict|district|province)/i.test(String(error.message || ''))) {
        // Database migration for address columns not installed yet: save the listing without the address.
        for (const column of Object.keys(addressColumns)) delete payload[column];
        const retry = mode === 'edit'
          ? (currentIsAdmin ? supabase.from('listings').update(payload).eq('id', form.dataset.id) : supabase.from('listings').update(payload).eq('id', form.dataset.id).eq('owner_id', currentSession.user.id))
          : supabase.from('listings').insert({ ...payload, owner_id:currentSession.user.id, image_url:uploaded.url, image_path:uploaded.path, is_available:true });
        ({ data: savedRow, error } = await retry.select('id').maybeSingle());
        if (!error) showToast('บันทึกประกาศแล้ว แต่ยังบันทึกที่อยู่ไม่ได้ (ฐานข้อมูลยังไม่ได้ติดตั้ง listing_address_migration.sql)');
      }
      if (error) {
        await removeUploadedImage();
        return showToast('บันทึกประกาศไม่สำเร็จ: ' + friendlyError(error));
      }
      if (!savedRow) {
        await removeUploadedImage();
        return showToast(mode === 'edit'
          ? 'ไม่สามารถแก้ไขประกาศนี้ได้ อาจไม่มีสิทธิ์หรือประกาศถูกลบแล้ว'
          : 'สร้างประกาศไม่สำเร็จ ฐานข้อมูลไม่ส่งรายการที่บันทึกกลับมา');
      }
      if (mode === 'edit' && uploaded.path && form.dataset.imagePath) {
        const removed = await supabase.storage.from(LISTING_IMAGE_BUCKET).remove([form.dataset.imagePath]);
        if (removed.error) console.warn('ลบรูปเก่าไม่สำเร็จ', removed.error);
      }
      await refreshListings();
      closeModal();
      if (mode === 'edit') {
        await renderAccountTab(accountTab);
        showToast('บันทึกการแก้ไขประกาศแล้ว');
        return;
      }
      const savedListing = listingCache.find(item => item.id === savedRow.id);
      if (savedListing) listingDetail(savedRow.id);
      else openAccountDashboard('my-listings');
      showToast('ลงประกาศสำเร็จแล้ว');
      return;
    } catch (error) {
      await removeUploadedImage();
      showToast('บันทึกประกาศไม่สำเร็จ: ' + friendlyError(error));
      return;
    }
  }
  if (mode === 'edit' && !getListings().some(item => item.id === form.dataset.id)) return showToast('ไม่พบประกาศที่ต้องการแก้ไข');
  const owner = String(data.owner || '').trim() || 'สมาชิก';
  const existingItem = getListings().find(item => item.id === form.dataset.id);
  const newItem = {
    id:mode === 'edit' ? form.dataset.id : 'user-' + Date.now(),
    owner, title, category, categoryLabel:categoryLabels[category] || 'อื่น ๆ',
    price, deposit, location, condition, description, address:address.parsed, addressText:address.full,
    initial:owner.slice(0,1), tag:'ประกาศใหม่ · เดโม',
    image:existingItem?.image || 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
    available:existingItem?.available ?? true
  };
  const all = getListings();
  const existingIndex = all.findIndex(item => item.id === newItem.id);
  if (existingIndex >= 0) all[existingIndex] = { ...all[existingIndex], ...newItem };
  else all.unshift(newItem);
  writeStore(STORAGE.listings, all);
  renderListings();
  closeModal();
  listingDetail(newItem.id);
  showToast(mode === 'edit' ? 'บันทึกการแก้ไขประกาศแล้ว' : 'เพิ่มประกาศตัวอย่างในเบราว์เซอร์นี้แล้ว');
}
async function handleBookingSubmit(form) {
  if (form.dataset.submitting === 'true') return;
  const data = Object.fromEntries(new FormData(form).entries());
  const item = getListings().find(x => x.id === form.dataset.id);
  if (!item) return showToast('ไม่พบรายการนี้');
  const days = rentalDaysInclusive(data.start, data.end);
  const today = formatDateInput(new Date());
  if (!days) return showToast('วันคืนต้องเป็นวันเดียวกันหรือหลังวันรับของ');
  if (data.start < today) return showToast('ไม่สามารถจองวันที่ผ่านมาแล้วได้');
  const place = String(data.place || '').trim();
  if (place.length < 2 || place.length > 100) return showToast('กรุณาระบุจุดนัดรับ 2–100 ตัวอักษร');
  const contactPhone = String(data.contact_phone || '').trim().replace(/[^\d+]/g, '');
  if (contactPhone && (contactPhone.length < 7 || contactPhone.length > 25)) return showToast('เบอร์ติดต่อต้องมีความยาว 7–25 ตัวอักษร');
  form.dataset.submitting = 'true';
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'กำลังส่งคำขอ…'; }
  if (liveMode) {
    if (!currentSession?.user) { form.dataset.submitting = 'false'; if (submitButton) submitButton.disabled = false; return openAuthModal('login'); }
    if (currentSession.user.id === item.owner_id) { form.dataset.submitting = 'false'; if (submitButton) submitButton.disabled = false; return showToast('คุณไม่สามารถจองประกาศของตัวเองได้'); }
    const payload = {
      listing_id:item.id, renter_id:currentSession.user.id, start_date:data.start,
      end_date:data.end, pickup_location:place, note:String(data.note || '').trim() || null,
      status:'pending', request_key:form.dataset.requestKey
    };
    if (contactPhone) payload.renter_contact_phone = contactPhone;
    try {
      const { data:saved, error } = await supabase.from('bookings')
        .insert(payload).select('id,total_price').single();
      if (error) { showToast('ส่งคำขอจองไม่สำเร็จ: ' + friendlyError(error)); return; }
      const pins = readMeetingPicker();
      let pinWarning = '';
      if (pins.pickup || pins.return) {
        const { error:pinError } = await saveMeetingPoints(saved.id, pins);
        if (pinError) pinWarning = ' · บันทึกหมุดไม่สำเร็จ: ' + friendlyError(pinError);
      }
      closeModal();
      showToast(`ส่งคำขอจองแล้ว ${days} วัน · ค่าเช่ารวม ฿${formatBaht(saved.total_price)} · มัดจำ ฿${formatBaht(item.deposit || 0)} (ยังไม่มีการชำระเงิน)${pinWarning}`);
      return;
    } catch (error) {
      showToast('ส่งคำขอจองไม่สำเร็จ: ' + friendlyError(error));
      return;
    } finally {
      if ($('#bookingForm')) {
        $('#bookingForm').dataset.submitting = 'false';
        const button = $('#bookingForm button[type="submit"]');
        if (button) { button.disabled = false; button.textContent = 'ส่งคำขอจอง'; }
      }
    }
  }
  const bookings=readStore(STORAGE.bookings,[]);bookings.unshift({id:'book-'+Date.now(),listingId:item.id,title:item.title,start:data.start,end:data.end,days,place,note:data.note||'',estimate:days*item.price,status:'คำขอจำลอง',createdAt:new Date().toISOString()});writeStore(STORAGE.bookings,bookings);closeModal();showToast(`บันทึกคำขอจำลองแล้ว: ${days} วัน รวมค่าเช่าตัวอย่าง ฿${formatBaht(days*item.price)}`);
}
function toggleFavorite(id) {const fav=getFavorites();const next=fav.includes(id)?fav.filter(x=>x!==id):[...fav,id];writeStore(STORAGE.favorites,next);renderListings();showToast(next.includes(id)?'บันทึกไว้แล้ว':'นำออกจากรายการที่บันทึกแล้ว');}

function authMarkup(mode='login') {
  const signup = mode === 'signup';
  return `<div class="auth-mode-row"><button type="button" class="btn ${!signup?'btn-primary':'btn-secondary'}" data-action="auth-mode-login">เข้าสู่ระบบ</button><button type="button" class="btn ${signup?'btn-primary':'btn-secondary'}" data-action="auth-mode-signup">สมัครสมาชิก</button></div>
  <form id="authForm" data-mode="${signup?'signup':'login'}"><div class="form-grid">
    ${signup?'<div class="form-field full"><label for="authName">ชื่อที่ใช้แสดง *</label><input id="authName" name="full_name" required maxlength="60" autocomplete="name" placeholder="ชื่อเล่นหรือชื่อที่อยากให้แสดง"></div><div class="form-field full"><label for="authUniversity">สถานศึกษา *</label><input id="authUniversity" name="university" required maxlength="120" autocomplete="organization" placeholder="เช่น มหาวิทยาลัยของคุณ"></div>':''}
    <div class="form-field full"><label for="authEmail">อีเมล *</label><input id="authEmail" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
    <div class="form-field full"><label for="authPassword">รหัสผ่าน *</label><input id="authPassword" name="password" type="password" required minlength="6" autocomplete="${signup?'new-password':'current-password'}" placeholder="อย่างน้อย 6 ตัวอักษร"></div>
  </div><p id="authError" class="form-footnote" aria-live="polite"></p><p class="form-footnote">ใช้ข้อมูลที่คุณควบคุมได้ และห้ามใช้รหัสผ่านเดียวกับบัญชีสำคัญอื่น</p><div class="form-actions"><button type="submit" class="btn btn-primary">${signup?'สร้างบัญชี':'เข้าสู่ระบบ'}</button></div></form>`;
}
function openAuthModal(mode='login') {
  if (!liveMode) {
    openModal('ตั้งค่าระบบสมาชิก','ต้องต่อ Supabase ก่อนใช้บัญชีจริง',`<p>ตอนนี้เว็บกำลังอยู่ในโหมดตัวอย่าง เพราะยังไม่ได้กำหนดค่า Supabase ในไฟล์ <code>.env.local</code></p><p>เปิด README แล้วทำขั้นตอนตั้งค่าฐานข้อมูลและ URL/Key ก่อน จากนั้นรีสตาร์ต <code>npm run dev</code></p><div class="form-actions"><button class="btn btn-primary" data-action="close">เข้าใจแล้ว</button></div>`);
    return;
  }
  openModal(mode==='signup'?'สมัครสมาชิก':'เข้าสู่ระบบ', 'ใช้บัญชีนี้ลงประกาศและติดตามคำขอจอง', authMarkup(mode));
}
async function handleAuthSubmit(form) {
  if (!liveMode) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('button[type="submit"]'); if (button) { button.disabled=true; button.textContent='กำลังดำเนินการ…'; }
  let result;
  try {
    if (form.dataset.mode === 'signup') {
      result = await supabase.auth.signUp({ email:data.email.trim(), password:data.password, options:{ data:{ full_name:data.full_name.trim(), university:data.university.trim() } } });
      if (result.error) throw result.error;
      if (!result.data.session) {
        closeModal(); showToast('สมัครแล้ว กรุณาตรวจอีเมลและกดยืนยัน ก่อนเข้าสู่ระบบ'); return;
      }
      applyAuthSession(result.data.session); closeModal(); showToast('สมัครสมาชิกสำเร็จ'); await refreshListings(); return;
    }
    result = await supabase.auth.signInWithPassword({email:data.email.trim(),password:data.password});
    if (result.error) throw result.error;
    applyAuthSession(result.data.session); closeModal(); showToast('เข้าสู่ระบบสำเร็จ'); await refreshListings();
  } catch (error) {
    const target = $('#authError'); if (target) target.textContent = friendlyError(error);
  } finally {
    const liveButton = $('#authForm button[type="submit"]'); if (liveButton) { liveButton.disabled=false; liveButton.textContent=$('#authForm').dataset.mode==='signup'?'สร้างบัญชี':'เข้าสู่ระบบ'; }
  }
}

function statusText(status) { return ({pending:'รออนุมัติ',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธ',cancelled:'ยกเลิก',completed:'เสร็จสิ้น'})[status] || status; }
function bookingGroups(rows) {
  const today = formatDateInput(new Date());
  const groups = [
    ['pending','รอเจ้าของตอบรับ', row => row.status === 'pending'],
    ['upcoming','อนุมัติแล้ว · กำลังจะมาถึง', row => row.status === 'approved' && row.start_date > today],
    ['active','อนุมัติแล้ว · กำลังเช่า', row => row.status === 'approved' && row.start_date <= today && row.end_date >= today],
    ['return','ถึงกำหนดคืน · รอการยืนยัน', row => row.status === 'approved' && row.end_date <= today],
    ['completed','เสร็จสิ้น', row => row.status === 'completed'],
    ['rejected','ปฏิเสธแล้ว', row => row.status === 'rejected'],
    ['cancelled','ยกเลิกแล้ว', row => row.status === 'cancelled']
  ];
  return groups.map(([key,title,matches]) => ({key,title,rows:rows.filter(matches)})).filter(group => group.rows.length);
}
function meetingRowMarkup(row, role) {
  const pickup = toPoint(row.pickup_point_lat, row.pickup_point_lng);
  const ret = toPoint(row.return_point_lat, row.return_point_lng);
  const canEdit = (role === 'owner' || role === 'renter') && ['pending','approved'].includes(row.status) && !row.owner_return_received_at;
  const sameReturn = pickup && (!ret || (ret.lat === pickup.lat && ret.lng === pickup.lng));
  const buttons = [
    pickup ? `<button class="btn btn-secondary btn-small" data-action="booking-route" data-id="${escapeHTML(row.id)}" data-kind="pickup">นำทางไปจุดรับ</button>` : '',
    pickup && !sameReturn ? `<button class="btn btn-secondary btn-small" data-action="booking-route" data-id="${escapeHTML(row.id)}" data-kind="return">นำทางไปจุดคืน</button>` : '',
    pickup && sameReturn ? `<button class="btn btn-secondary btn-small" data-action="booking-route" data-id="${escapeHTML(row.id)}" data-kind="return">นำทางไปจุดคืน (จุดเดียวกัน)</button>` : '',
    canEdit ? `<button class="btn btn-secondary btn-small" data-action="edit-meeting-points" data-id="${escapeHTML(row.id)}">${pickup?'แก้ไขหมุดจุดนัด':'ปักหมุดจุดนัดรับ/คืน'}</button>` : ''
  ].filter(Boolean).join('');
  if (!buttons) return '';
  return `<div class="meeting-row"><span>${pickup?'📍 มีหมุดจุดนัดแล้ว':'ยังไม่ได้ปักหมุดจุดนัด'}</span>${buttons}</div>`;
}
function renderBookingRows(rows, listingById, role, renterNames = {}, reviewedBookingIds = new Set()) {
  if (!rows.length) return '<div class="account-empty">ยังไม่มีรายการจองในส่วนนี้</div>';
  const groups = bookingGroups(rows);
  return groups.map(group => `<section class="booking-group" data-booking-group="${group.key}"><h3>${group.title} <span>${group.rows.length}</span></h3><div class="account-list">${group.rows.map(row => {
    const item = listingById[row.listing_id] || {};
    const days = rentalDaysInclusive(row.start_date,row.end_date);
    const image = item.image_url || 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80';
    const dailyRate = row.price_per_day ?? (days ? Number(row.total_price) / days : null);
    const depositText = row.deposit == null ? 'ไม่บันทึกข้อมูลเดิม' : `฿${formatBaht(row.deposit)}`;
    const contact = role === 'owner'
      ? `ผู้จอง: ${escapeHTML(renterNames[row.renter_id] || 'สมาชิก')}`
      : `เจ้าของ: ${escapeHTML(item.profiles?.full_name || 'สมาชิก')}`;
    const isOwner = role === 'owner';
    const isRenter = role === 'renter';
    const otherUserId = isRenter ? item.owner_id : row.renter_id;
    const milestone = (action, label) => `<button class="btn btn-primary" data-action="confirm-booking-step" data-id="${escapeHTML(row.id)}" data-step="${action}">${label}</button>`;
    const actions = [
      item.id ? `<button class="btn btn-secondary" data-action="booking-chat" data-id="${escapeHTML(row.id)}">แชตเกี่ยวกับการจอง</button>` : '',
      `<button class="btn btn-secondary" data-action="booking-evidence" data-id="${escapeHTML(row.id)}">ดูหลักฐานภาพ</button>`,
      role === 'renter' && row.status === 'pending' ? `<button class="btn btn-danger" data-action="cancel-booking" data-id="${escapeHTML(row.id)}">ยกเลิกคำขอ</button>` : '',
      role !== 'renter' && row.status === 'pending' ? `<button class="btn btn-primary" data-action="booking-approve" data-id="${escapeHTML(row.id)}">อนุมัติ</button><button class="btn btn-danger" data-action="booking-reject" data-id="${escapeHTML(row.id)}">ปฏิเสธ</button>` : '',
      isOwner && row.status === 'approved' && !row.owner_handed_over_at ? milestone('owner_handover','ยืนยันส่งมอบสินค้า') : '',
      isRenter && row.status === 'approved' && row.owner_handed_over_at && !row.renter_received_at ? milestone('renter_received','ยืนยันว่าได้รับสินค้า') : '',
      isRenter && row.status === 'approved' && row.renter_received_at && !row.renter_returned_at && row.end_date <= formatDateInput() ? milestone('renter_return','แจ้งว่าคืนสินค้าแล้ว') : '',
      isOwner && row.status === 'approved' && row.renter_returned_at && !row.owner_return_received_at ? milestone('owner_return','ยืนยันได้รับสินค้าคืน') : '',
      isOwner && row.status === 'approved' && row.owner_return_received_at ? '<span class="status-pill pending">รับคืนแล้ว · รอปิดการตรวจสอบ</span>' : '',
      isRenter && row.status === 'completed' && !reviewedBookingIds.has(row.id) ? `<button class="btn btn-primary" data-action="review-booking" data-id="${escapeHTML(row.id)}" data-listing-id="${escapeHTML(row.listing_id)}">เขียนรีวิว</button>` : '',
      isRenter && row.status === 'completed' && reviewedBookingIds.has(row.id) ? '<span class="status-pill approved">รีวิวแล้ว</span>' : '',
      (isOwner || isRenter) ? `<button class="btn btn-secondary" data-action="report-booking" data-id="${escapeHTML(row.id)}" data-listing-id="${escapeHTML(row.listing_id)}" data-reported-user-id="${escapeHTML(otherUserId || '')}">รายงานปัญหา</button>` : ''
    ].filter(Boolean).join('');
    const milestones = [
      ['owner_handed_over_at','เจ้าของยืนยันส่งมอบ'],
      ['renter_received_at','ผู้เช่ายืนยันรับสินค้า'],
      ['renter_returned_at','ผู้เช่าแจ้งคืนสินค้า'],
      ['owner_return_received_at','เจ้าของยืนยันรับคืน']
    ].map(([field,label]) => `<span class="milestone ${row[field] ? 'done' : ''}">${label}${row[field] ? ` · ${escapeHTML(formatTime(row[field]))}` : ' · รอดำเนินการ'}</span>`).join('');
    const phoneMarkup = role === 'admin'
      ? [row.renter_contact_phone?`ผู้เช่า: <a href="tel:${escapeHTML(row.renter_contact_phone)}">${escapeHTML(row.renter_contact_phone)}</a>`:'',row.owner_contact_phone?`เจ้าของ: <a href="tel:${escapeHTML(row.owner_contact_phone)}">${escapeHTML(row.owner_contact_phone)}</a>`:''].filter(Boolean).join(' · ')
      : (role === 'owner' ? row.renter_contact_phone : row.owner_contact_phone)
        ? `เบอร์ติดต่อคู่สัญญา: <a href="tel:${escapeHTML(role === 'owner' ? row.renter_contact_phone : row.owner_contact_phone)}">${escapeHTML(role === 'owner' ? row.renter_contact_phone : row.owner_contact_phone)}</a>`
        : '';
    return `<article class="account-row booking-row"><img class="booking-thumbnail" src="${escapeHTML(image)}" alt="${escapeHTML(item.title || 'รูปประกาศ')}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'"><div class="booking-copy"><h4>${escapeHTML(item.title || 'ประกาศสินค้า')}</h4><p>${contact}</p>${phoneMarkup?`<p>${phoneMarkup}</p>`:''}<p>วันเช่า: ${escapeHTML(formatDateThai(row.start_date))} – ${escapeHTML(formatDateThai(row.end_date))} · ${days} วัน (นับรวมวันรับและวันคืน)</p><p>ค่าเช่า: ฿${formatBaht(dailyRate || 0)} / วัน × ${days} วัน = ฿${formatBaht(row.total_price)} · มัดจำ ${depositText}</p><p>จุดนัดรับ: ${escapeHTML(row.pickup_location || '-')} · <span class="status-pill ${escapeHTML(row.status)}">${escapeHTML(statusText(row.status))}</span></p>${meetingRowMarkup(row, role)}${row.note ? `<p>ข้อความ: ${escapeHTML(row.note)}</p>` : ''}${row.rejection_reason ? `<p>เหตุผลที่ปฏิเสธ: ${escapeHTML(row.rejection_reason)}</p>` : ''}${row.status === 'approved' || row.status === 'completed' ? `<div class="booking-milestones" aria-label="สถานะการส่งมอบและคืนสินค้า">${milestones}</div>` : ''}</div><div class="account-actions">${actions}</div></article>`;
  }).join('')}</div></section>`).join('');
}
function accountShell(tab) {
  const tabs = currentIsAdmin
    ? [['profile','โปรไฟล์ของฉัน'],['admin-overview','ภาพรวมแอดมิน'],['admin-listings','ประกาศทั้งหมด'],['admin-bookings','การจองทั้งหมด'],['admin-payments','การชำระเงิน'],['admin-reports','รายงานปัญหา'],['admin-users','สมาชิกทั้งหมด'],['my-listings','ประกาศของฉัน'],['as-renter','รายการที่ฉันจอง'],['as-owner','คำขอที่ได้รับ'],['payments','การชำระเงินของฉัน'],['my-reports','รายงานของฉัน'],['my-wanted','ความต้องการของฉัน'],['incoming-offers','ข้อเสนอที่ได้รับ'],['inbox','ข้อความ']]
    : [['profile','โปรไฟล์ของฉัน'],['my-listings','ประกาศของฉัน'],['as-renter','รายการที่ฉันจอง'],['as-owner','คำขอที่ได้รับ'],['payments','การชำระเงิน'],['my-reports','รายงานของฉัน'],['my-wanted','ความต้องการของฉัน'],['incoming-offers','ข้อเสนอที่ได้รับ'],['inbox','ข้อความ']];
  return `<div class="account-tabs">${tabs.map(([key,label])=>`<button class="account-tab ${tab===key?'active':''}" data-action="account-tab" data-tab="${key}" aria-pressed="${tab===key}">${label}</button>`).join('')}<button class="account-tab" data-action="logout">ออกจากระบบ</button></div><div id="accountContent"><div class="account-empty">กำลังโหลดข้อมูล…</div></div>`;
}
const reportCategoryLabels = {
  item_mismatch:'สินค้าไม่ตรงรายละเอียด', cannot_contact:'ติดต่อคู่สัญญาไม่ได้',
  handover_return:'ปัญหาการรับหรือคืนสินค้า', damaged_item:'สินค้าเสียหาย',
  user_conduct:'พฤติกรรมผู้ใช้', other:'อื่น ๆ'
};
const reportStatusLabels = { pending:'รอตรวจสอบ', investigating:'กำลังตรวจสอบ', resolved:'ดำเนินการแล้ว' };
function openAdminReportUpdate(report) {
  openModal('จัดการรายงานปัญหา', 'บันทึกสถานะและผลการตรวจสอบ', `<form id="adminReportForm" data-id="${escapeHTML(report.id)}" data-review-id="${escapeHTML(report.review_id || '')}"><div class="form-field"><label for="adminReportStatus">สถานะ</label><select id="adminReportStatus" name="status"><option value="pending" ${report.status==='pending'?'selected':''}>รอตรวจสอบ</option><option value="investigating" ${report.status==='investigating'?'selected':''}>กำลังตรวจสอบ</option><option value="resolved" ${report.status==='resolved'?'selected':''}>ดำเนินการแล้ว</option></select></div><div class="form-field"><label for="adminReportResolution">ผลการตรวจสอบ</label><textarea id="adminReportResolution" name="resolution" maxlength="2000" placeholder="บันทึกสิ่งที่ตรวจสอบและการดำเนินการ">${escapeHTML(report.resolution || '')}</textarea></div>${report.review_id?`<label class="report-hide-review"><input type="checkbox" name="hideReview" ${report.review_hidden?'checked':''}> ซ่อนรีวิวนี้จากหน้าประกาศ</label>`:''}<div class="form-actions"><button class="btn btn-secondary" type="button" data-action="close">ยกเลิก</button><button class="btn btn-primary" type="submit">บันทึกผล</button></div></form>`);
}
async function updateAdminReport(form) {
  if (!currentIsAdmin) return showToast('ไม่มีสิทธิ์จัดการรายงาน');
  const data = new FormData(form);
  const { error } = await supabase.rpc('admin_update_issue_report', {
    p_report_id:form.dataset.id,
    p_status:String(data.get('status') || ''),
    p_resolution:String(data.get('resolution') || '').trim() || null,
    p_hide_review:form.elements.namedItem('hideReview') ? Boolean(data.get('hideReview')) : null
  });
  if (error) return showToast('บันทึกผลรายงานไม่สำเร็จ: ' + friendlyError(error));
  closeModal();
  showToast('อัปเดตรายงานแล้ว');
  await renderAccountTab('admin-reports');
}
async function renderIssueReports(out, admin = false) {
  let query = supabase.from('issue_reports')
    .select('id,reporter_id,booking_id,listing_id,reported_user_id,review_id,category,description,status,resolution,created_at,updated_at');
  if (!admin) query = query.eq('reporter_id', currentSession.user.id);
  const { data:reports, error } = await query.order('created_at', { ascending:false }).limit(100);
  if (error) throw error;
  if (!reports?.length) {
    out.innerHTML = `<div class="account-empty">${admin?'ยังไม่มีรายงานปัญหาให้ตรวจสอบ':'คุณยังไม่ได้ส่งรายงานปัญหา'}</div>`;
    return;
  }
  const userIds = [...new Set(reports.flatMap(report => [report.reporter_id, report.reported_user_id].filter(Boolean)))];
  const listingIds = [...new Set(reports.map(report => report.listing_id).filter(Boolean))];
  const bookingIds = [...new Set(reports.map(report => report.booking_id).filter(Boolean))];
  const [profileResult, listingResult, bookingResult] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id,full_name').in('id', userIds) : Promise.resolve({data:[],error:null}),
    listingIds.length ? supabase.from('listings').select('id,title').in('id', listingIds) : Promise.resolve({data:[],error:null}),
    bookingIds.length ? supabase.from('bookings').select('id,start_date,end_date,status').in('id', bookingIds) : Promise.resolve({data:[],error:null})
  ]);
  for (const result of [profileResult, listingResult, bookingResult]) if (result.error) throw result.error;
  const profiles = Object.fromEntries((profileResult.data || []).map(user => [user.id, user.full_name || 'สมาชิก']));
  const listings = Object.fromEntries((listingResult.data || []).map(listing => [listing.id, listing.title]));
  const bookings = Object.fromEntries((bookingResult.data || []).map(booking => [booking.id, booking]));
  const evidenceResult = await supabase.from('issue_report_evidence')
    .select('id,report_id,storage_path').in('report_id', reports.map(report => report.id));
  if (evidenceResult.error) throw evidenceResult.error;
  const evidenceRows = evidenceResult.data || [];
  const signedResult = evidenceRows.length
    ? await supabase.storage.from(RENTAL_EVIDENCE_BUCKET).createSignedUrls(evidenceRows.map(row => row.storage_path), 1800)
    : { data:[], error:null };
  if (signedResult.error) throw signedResult.error;
  const reportImages = {};
  evidenceRows.forEach((row, index) => {
    const url = signedResult.data?.[index]?.signedUrl;
    if (url) (reportImages[row.report_id] ||= []).push(url);
  });
  out.innerHTML = `<div class="account-list">${reports.map(report => {
    const booking = bookings[report.booking_id];
    const target = [
      report.listing_id ? `ประกาศ: ${escapeHTML(listings[report.listing_id] || 'ไม่พบประกาศ')}` : '',
      booking ? `การเช่า ${formatDateThai(booking.start_date)} – ${formatDateThai(booking.end_date)}` : '',
      report.reported_user_id ? `ผู้ใช้: ${escapeHTML(profiles[report.reported_user_id] || 'สมาชิก')}` : '',
      report.review_id ? 'รีวิวที่ถูกรายงาน' : ''
    ].filter(Boolean).join(' · ') || 'รายงานเกี่ยวกับผู้ใช้';
    const images = reportImages[report.id] || [];
    return `<article class="account-row issue-report-row"><div><h3>${escapeHTML(reportCategoryLabels[report.category] || 'รายงานปัญหา')}</h3><p>${target}</p>${admin?`<p>ผู้รายงาน: ${escapeHTML(profiles[report.reporter_id] || 'สมาชิก')}</p>`:''}<p>${escapeHTML(report.description)}</p>${images.length?`<div class="evidence-gallery">${images.map((url,index)=>`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHTML(url)}" alt="รูปประกอบรายงาน ${index+1}" loading="lazy"></a>`).join('')}</div>`:''}${report.resolution?`<p><strong>ผลดำเนินการ:</strong> ${escapeHTML(report.resolution)}</p>`:''}<p>${formatTime(report.created_at)} · <span class="status-pill ${report.status==='resolved'?'approved':report.status==='investigating'?'pending':'cancelled'}">${escapeHTML(reportStatusLabels[report.status] || report.status)}</span></p></div>${admin?`<div class="account-actions"><button class="btn btn-secondary" data-action="admin-report" data-id="${escapeHTML(report.id)}">ตรวจสอบ / อัปเดต</button></div>`:''}</article>`;
  }).join('')}</div>`;
}
const paymentTypeLabels = { rent:'ค่าเช่า + ค่าบริการ', deposit:'เงินมัดจำ' };
const paymentStatusLabels = {
  unpaid:'ยังไม่แจ้งชำระ',
  pending_verification:'รอตรวจสอบหลักฐาน',
  paid:'ตรวจสอบหลักฐานแล้ว',
  rejected:'หลักฐานไม่ผ่าน',
  refund_pending:'รอตรวจสอบและบันทึกการคืนเงินจริง',
  refunded:'ผู้ดูแลบันทึกว่าคืนเงินจริงแล้ว'
};
function paymentStatusClass(status) {
  if (status === 'paid' || status === 'refunded') return 'approved';
  if (status === 'pending_verification' || status === 'refund_pending') return 'pending';
  return 'cancelled';
}
let platformFeeSettings = { ...DEFAULT_FEE_SETTINGS };
async function loadPlatformFeeSettings() {
  if (!liveMode) return platformFeeSettings;
  const { data, error } = await supabase.from('platform_fee_settings').select('fee_percent,min_fee').eq('id',1).maybeSingle();
  if (error) { console.warn('โหลดค่าบริการแพลตฟอร์มไม่ได้ ใช้ค่าเริ่มต้นแทน', error); return platformFeeSettings; }
  if (data) platformFeeSettings = { fee_percent:Number(data.fee_percent), min_fee:Number(data.min_fee) };
  return platformFeeSettings;
}
function feeSettingsText(settings = platformFeeSettings) {
  return Number(settings.fee_percent) > 0
    ? `${formatBaht(settings.fee_percent)}% ของค่าเช่า (ขั้นต่ำ ฿${formatBaht(settings.min_fee)})`
    : 'ไม่มีค่าบริการ';
}
const payoutStatusLabels = { pending:'รอแอดมินโอนให้เจ้าของ', paid:'โอนให้เจ้าของแล้ว' };
function renderPromptPayBox(target, promptpayId, promptpayName, amount) {
  if (!target) return;
  if (!promptpayId || !isValidPromptPayId(promptpayId)) { target.innerHTML = ''; return; }
  target.innerHTML = '<p class="form-footnote">กำลังสร้าง QR PromptPay…</p>';
  promptPayQrDataUrl(promptpayId, amount)
    .then(url => {
      if (!target.isConnected) return;
      target.innerHTML = `<div class="promptpay-box"><img class="promptpay-qr" src="${escapeHTML(url)}" alt="QR PromptPay ยอด ฿${formatBaht(amount)}"><div><strong>สแกนจ่ายด้วยแอปธนาคาร</strong><p>ยอด <strong>฿${formatBaht(amount)}</strong></p><p>ชื่อบัญชี: ${escapeHTML(promptpayName || '-')}</p><small>ตรวจชื่อบัญชีในแอปธนาคารให้ตรงก่อนกดยืนยัน แล้วแนบสลิปด้านล่าง</small></div></div>`;
    })
    .catch(error => { console.error('สร้าง QR ไม่สำเร็จ', error); if (target.isConnected) target.innerHTML = '<p class="form-footnote">สร้าง QR ไม่สำเร็จ กรุณาโอนตามคำแนะนำด้านบน</p>'; });
}
async function renderProfileSettings(out) {
  const [profileResult, contactResult] = await Promise.all([
    supabase.from('profiles').select('id,full_name,university,bio,avatar_url,avatar_path')
      .eq('id', currentSession.user.id).maybeSingle(),
    supabase.from('profile_contacts').select('phone')
      .eq('user_id', currentSession.user.id).maybeSingle()
  ]);
  if (profileResult.error) throw profileResult.error;
  if (contactResult.error) throw contactResult.error;
  const profile = profileResult.data;
  if (!profile) throw new Error('ไม่พบข้อมูลโปรไฟล์');
  currentProfile = { ...currentProfile, ...profile };
  out.innerHTML = `<section class="profile-settings"><h2>โปรไฟล์และข้อมูลติดต่อ</h2><p class="form-footnote">ชื่อ สถานศึกษา ประวัติย่อ และรูปโปรไฟล์จะแสดงแก่สมาชิกตามระบบเดิม ส่วนเบอร์โทรจะเป็นข้อมูลส่วนตัวและแสดงเฉพาะคู่สัญญาในรายการเช่า</p><form id="profileSettingsForm" data-avatar-path="${escapeHTML(profile.avatar_path || '')}"><div class="form-grid">
    <div class="form-field"><label for="profileName">ชื่อที่ใช้แสดง *</label><input id="profileName" name="full_name" required maxlength="60" value="${escapeHTML(profile.full_name || '')}"></div>
    <div class="form-field"><label for="profileUniversity">สถานศึกษา *</label><input id="profileUniversity" name="university" required maxlength="120" value="${escapeHTML(profile.university || '')}"></div>
    <div class="form-field full"><label for="profileBio">แนะนำตัว <span class="hint">(ไม่บังคับ)</span></label><textarea id="profileBio" name="bio" maxlength="500" placeholder="ยังไม่ได้ระบุรายละเอียด">${escapeHTML(profile.bio || '')}</textarea></div>
    <div class="form-field full"><label for="profilePhone">เบอร์ติดต่อส่วนตัว <span class="hint">(ไม่บังคับ)</span></label><input id="profilePhone" name="phone" type="tel" autocomplete="tel" maxlength="25" value="${escapeHTML(contactResult.data?.phone || '')}" placeholder="บันทึกไว้ให้กรอกในคำขอจองครั้งต่อไป"><small>เบอร์นี้ไม่แสดงในหน้าประกาศสาธารณะ</small></div>
    <div class="form-field full"><label for="profileAvatar">รูปโปรไฟล์ <span class="hint">(ไม่บังคับ · JPG/PNG/WebP ไม่เกิน 5 MB)</span></label>${profile.avatar_url?`<img class="profile-avatar-preview" src="${escapeHTML(profile.avatar_url)}" alt="รูปโปรไฟล์ปัจจุบัน">`:''}<input id="profileAvatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><label class="checkbox-row"><input type="checkbox" name="remove_avatar"> ลบรูปโปรไฟล์ปัจจุบัน</label></div>
  </div><div class="form-actions"><button type="submit" class="btn btn-primary">บันทึกโปรไฟล์</button></div></form></section>`;
}
async function saveProfileSettings(form) {
  const data = new FormData(form);
  const name = String(data.get('full_name') || '').trim();
  const university = String(data.get('university') || '').trim();
  const bio = String(data.get('bio') || '').trim() || null;
  const rawPhone = String(data.get('phone') || '').trim();
  const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, '') : null;
  if (!name || !university) return showToast('กรุณากรอกชื่อและสถานศึกษา');
  if (phone && (phone.length < 7 || phone.length > 25)) return showToast('เบอร์ติดต่อต้องมีความยาว 7–25 ตัวอักษร');
  const button = form.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = 'กำลังบันทึก…'; }
  let uploadedAvatar = null;
  let contactSaved = false;
  try {
    const contactResult = await supabase.from('profile_contacts').upsert({
      user_id:currentSession.user.id, phone, updated_at:new Date().toISOString()
    }, { onConflict:'user_id' });
    if (contactResult.error) throw contactResult.error;
    contactSaved = true;
    const avatarFile = form.elements.namedItem('avatar').files?.[0];
    if (avatarFile) uploadedAvatar = await uploadProfileAvatar(avatarFile);
    const removeAvatar = Boolean(data.get('remove_avatar')) && !uploadedAvatar;
    const profilePatch = {
      full_name:name,
      university,
      bio,
      ...(uploadedAvatar ? { avatar_url:uploadedAvatar.url, avatar_path:uploadedAvatar.path } : {}),
      ...(removeAvatar ? { avatar_url:null, avatar_path:null } : {})
    };
    const { data:saved, error } = await supabase.from('profiles').update(profilePatch)
      .eq('id', currentSession.user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error('ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาตรวจสอบสิทธิ์บัญชี');
    currentProfile = { ...currentProfile, ...profilePatch };
    updateAuthButtons();
    const oldPath = form.dataset.avatarPath;
    if (oldPath && (uploadedAvatar || removeAvatar)) {
      const { error:removeError } = await supabase.storage.from(LISTING_IMAGE_BUCKET).remove([oldPath]);
      if (removeError) console.warn('อัปเดตรูปแล้วแต่ลบรูปเก่าไม่สำเร็จ', removeError);
    }
    closeModal();
    showToast('บันทึกโปรไฟล์และข้อมูลติดต่อแล้ว');
    await refreshListings();
    await renderAccountTab('profile');
  } catch (error) {
    if (uploadedAvatar) {
      const { error:cleanupError } = await supabase.storage.from(LISTING_IMAGE_BUCKET).remove([uploadedAvatar.path]);
      if (cleanupError) console.warn('ลบรูปโปรไฟล์ที่อัปโหลดไม่สำเร็จ', cleanupError);
    }
    showToast(`${contactSaved?'บันทึกเบอร์แล้ว แต่บันทึกโปรไฟล์ไม่สำเร็จ':'บันทึกโปรไฟล์ไม่สำเร็จ'}: ${friendlyError(error)}`);
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = 'บันทึกโปรไฟล์'; }
  }
}
async function renderPayments(out, admin = false) {
  let bookingRows = [];
  let payments = [];
  if (admin) {
    const [paymentResult, payableBookingsResult] = await Promise.all([
      supabase.from('booking_payments')
        .select('id,booking_id,payer_id,payment_type,amount,status,submitted_at,reviewed_by,reviewed_at,review_note,refunded_by,refunded_at,refund_note,updated_at')
        .order('submitted_at', { ascending:false }).limit(500),
      supabase.from('bookings')
        .select('id,listing_id,renter_id,status,start_date,end_date,total_price,price_per_day,deposit,service_fee')
        .in('status',['approved','completed']).order('created_at',{ascending:false}).limit(500)
    ]);
    if (paymentResult.error) throw paymentResult.error;
    if (payableBookingsResult.error) throw payableBookingsResult.error;
    payments = paymentResult.data || [];
    const bookingIds = [...new Set([
      ...payments.map(row => row.booking_id),
      ...(payableBookingsResult.data || []).map(row => row.id)
    ])];
    const bookingResult = bookingIds.length
      ? await supabase.from('bookings').select('id,listing_id,renter_id,status,start_date,end_date,total_price,price_per_day,deposit,service_fee').in('id',bookingIds)
      : { data:[], error:null };
    if (bookingResult.error) throw bookingResult.error;
    bookingRows = bookingResult.data || [];
    const allPaymentsResult = bookingIds.length
      ? await supabase.from('booking_payments')
        .select('id,booking_id,payer_id,payment_type,amount,status,submitted_at,reviewed_by,reviewed_at,review_note,refunded_by,refunded_at,refund_note,updated_at')
        .in('booking_id',bookingIds).order('submitted_at',{ascending:false})
      : {data:[],error:null};
    if(allPaymentsResult.error) throw allPaymentsResult.error;
    payments = allPaymentsResult.data || [];
  } else {
    const [renterResult, ownedResult] = await Promise.all([
      supabase.from('bookings').select('id,listing_id,renter_id,status,start_date,end_date,total_price,price_per_day,deposit,service_fee')
        .eq('renter_id', currentSession.user.id).order('created_at', { ascending:false }).limit(500),
      supabase.from('listings').select('id').eq('owner_id', currentSession.user.id)
    ]);
    if (renterResult.error) throw renterResult.error;
    if (ownedResult.error) throw ownedResult.error;
    const ownedIds = (ownedResult.data || []).map(row => row.id);
    const ownerResult = ownedIds.length
      ? await supabase.from('bookings').select('id,listing_id,renter_id,status,start_date,end_date,total_price,price_per_day,deposit,service_fee')
        .in('listing_id', ownedIds).order('created_at', { ascending:false }).limit(500)
      : { data:[], error:null };
    if (ownerResult.error) throw ownerResult.error;
    bookingRows = [...new Map([...(renterResult.data || []), ...(ownerResult.data || [])].map(row => [row.id,row])).values()];
  }
  const settingsResult = await supabase.from('payment_settings').select('instructions,updated_at,promptpay_id,promptpay_name').eq('id',1).maybeSingle();
  if (settingsResult.error) throw settingsResult.error;
  const instructions = settingsResult.data?.instructions || '';
  const promptpayId = settingsResult.data?.promptpay_id || '';
  const promptpayName = settingsResult.data?.promptpay_name || '';
  const feeSettings = await loadPlatformFeeSettings();
  let payoutQuery = supabase.from('owner_payouts')
    .select('id,booking_id,owner_id,rent_amount,service_fee,payout_amount,status,created_at,paid_at,paid_note')
    .order('created_at', { ascending:false }).limit(500);
  if (!admin) payoutQuery = payoutQuery.eq('owner_id', currentSession.user.id);
  const [payoutResult, summaryResult] = await Promise.all([
    payoutQuery,
    admin ? supabase.rpc('admin_platform_finance_summary') : Promise.resolve({ data:null, error:null })
  ]);
  if (payoutResult.error) throw payoutResult.error;
  if (summaryResult.error) throw summaryResult.error;
  const payouts = payoutResult.data || [];
  const financeSummary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
  const allBookingIds = bookingRows.map(row => row.id);
  const relevantBookings = bookingRows.filter(row => ['approved','completed'].includes(row.status));
  if (!admin) {
    const paymentResult = allBookingIds.length
      ? await supabase.from('booking_payments')
        .select('id,booking_id,payer_id,payment_type,amount,status,submitted_at,reviewed_by,reviewed_at,review_note,refunded_by,refunded_at,refund_note,updated_at')
        .in('booking_id', allBookingIds).order('submitted_at', { ascending:false })
      : { data:[], error:null };
    if (paymentResult.error) throw paymentResult.error;
    payments = paymentResult.data || [];
  }
  const paymentIds = payments.map(row => row.id);
  const eventsResult = paymentIds.length
    ? await supabase.from('booking_payment_events').select('*').in('payment_id', paymentIds).order('created_at', { ascending:true })
    : { data:[], error:null };
  if (eventsResult.error) throw eventsResult.error;
  const eventsByPayment = {};
  for (const event of eventsResult.data || []) (eventsByPayment[event.payment_id] ||= []).push(event);
  const listingIds = [...new Set(bookingRows.map(row => row.listing_id))];
  const profileIds = [...new Set([
    ...bookingRows.map(row => row.renter_id),
    ...payouts.map(row => row.owner_id),
    ...(eventsResult.data || []).map(event => event.actor_id).filter(Boolean)
  ])];
  const [listingsResult, profilesResult, usersResult] = await Promise.all([
    listingIds.length ? supabase.from('listings').select('id,title,owner_id').in('id',listingIds) : Promise.resolve({data:[],error:null}),
    profileIds.length ? supabase.from('profiles').select('id,full_name').in('id',profileIds) : Promise.resolve({data:[],error:null}),
    admin ? supabase.rpc('admin_list_users') : Promise.resolve({data:[],error:null})
  ]);
  for (const result of [listingsResult,profilesResult,usersResult]) if (result.error) throw result.error;
  const listingMap = Object.fromEntries((listingsResult.data || []).map(row => [row.id,row]));
  const profileMap = Object.fromEntries((profilesResult.data || []).map(row => [row.id,row.full_name || 'สมาชิก']));
  const userMap = Object.fromEntries((usersResult.data || []).map(row => [row.user_id,row]));
  const paymentMap = new Map();
  for (const payment of payments) {
    const key = `${payment.booking_id}:${payment.payment_type}`;
    if (!paymentMap.has(key)) paymentMap.set(key, []);
    paymentMap.get(key).push(payment);
  }
  const settingsPanel = admin
    ? `<section class="payment-settings"><h3>คำแนะนำการชำระเงิน</h3><p class="form-footnote">กรอกเฉพาะช่องทางและขั้นตอนที่ตรวจสอบแล้วจริง การตั้งค่านี้ไม่เปิดใช้ Payment Gateway</p><form id="paymentSettingsForm"><div class="form-field"><label for="paymentInstructions">คำแนะนำสำหรับผู้เช่า</label><textarea id="paymentInstructions" name="instructions" maxlength="2000" placeholder="ยังไม่ได้ตั้งค่า">${escapeHTML(instructions)}</textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary">บันทึกคำแนะนำ</button>${instructions?'<button type="button" class="btn btn-danger" data-action="clear-payment-instructions">ลบคำแนะนำ</button>':''}</div></form>${settingsResult.data?`<small>อัปเดตล่าสุด ${escapeHTML(formatTime(settingsResult.data.updated_at))}</small>`:'<small>ยังไม่มีคำแนะนำการชำระเงิน</small>'}</section>`
    : instructions
      ? `<section class="payment-settings"><h3>คำแนะนำการชำระเงิน</h3><p>${escapeHTML(instructions).replace(/\n/g,'<br>')}</p><small>ตรวจสอบข้อมูลกับแอดมินก่อนโอนทุกครั้ง</small></section>`
      : '<section class="payment-settings"><h3>คำแนะนำการชำระเงิน</h3><p>แอดมินยังไม่ได้ตั้งค่าช่องทางชำระเงิน จึงยังส่งหลักฐานไม่ได้ โปรดตรวจสอบอีกครั้งภายหลัง</p></section>';
  const bookingById = Object.fromEntries(bookingRows.map(row => [row.id,row]));
  const payoutRowHtml = payout => {
    const booking = bookingById[payout.booking_id];
    const listing = booking ? listingMap[booking.listing_id] : null;
    const ownerName = userMap[payout.owner_id]?.full_name || profileMap[payout.owner_id] || 'สมาชิก';
    const action = admin && payout.status === 'pending'
      ? `<button class="btn btn-primary" data-action="owner-payout" data-id="${escapeHTML(payout.id)}">บันทึกว่าโอนให้เจ้าของแล้ว</button>`
      : '';
    return `<article class="account-row owner-payout-row" data-payout-status="${escapeHTML(payout.status)}"><div><h3>${escapeHTML(listing?.title || 'รายการจอง')} · โอนให้เจ้าของ ฿${formatBaht(payout.payout_amount)}</h3>${admin?`<p>เจ้าของ: ${escapeHTML(ownerName)}${userMap[payout.owner_id]?.email?` (${escapeHTML(userMap[payout.owner_id].email)})`:''}</p>`:''}<p>ค่าเช่า ฿${formatBaht(payout.rent_amount)} · ค่าบริการที่แพลตฟอร์มเก็บ ฿${formatBaht(payout.service_fee)}</p>${booking?`<p>ช่วงเช่า: ${formatDateThai(booking.start_date)} – ${formatDateThai(booking.end_date)}</p>`:''}<p>สร้างเมื่อ ${escapeHTML(formatTime(payout.created_at))} · <span class="status-pill ${payout.status==='paid'?'approved':'pending'}">${escapeHTML(payoutStatusLabels[payout.status] || payout.status)}</span></p>${payout.paid_note?`<p>บันทึกการโอน: ${escapeHTML(payout.paid_note)}${payout.paid_at?` · ${escapeHTML(formatTime(payout.paid_at))}`:''}</p>`:''}</div><div class="account-actions">${action}</div></article>`;
  };
  const payoutSection = payouts.length
    ? `<section class="payment-settings owner-payouts"><h3>${admin?'ยอดที่ต้องโอนให้เจ้าของ':'รายได้จากการปล่อยเช่า'}</h3><p class="form-footnote">${admin?'สร้างอัตโนมัติเมื่อยืนยันสลิปค่าเช่าและการเช่าเสร็จสิ้น โอนเงินให้เจ้าของนอกระบบ (ติดต่อเจ้าของผ่านแชตเพื่อขอช่องทางรับเงิน) แล้วจึงบันทึกที่นี่':'แพลตฟอร์มจะโอนค่าเช่าให้คุณหลังการเช่าเสร็จสิ้นและตรวจสลิปค่าเช่าแล้ว ค่าบริการแพลตฟอร์มเรียกเก็บจากผู้เช่า ไม่หักจากค่าเช่าของคุณ'}</p><div class="account-list">${payouts.map(payoutRowHtml).join('')}</div></section>`
    : (admin ? '<section class="payment-settings owner-payouts"><h3>ยอดที่ต้องโอนให้เจ้าของ</h3><p>ยังไม่มีรายการที่ต้องโอน</p></section>' : '');
  const adminFinancePanel = admin
    ? `<section class="payment-settings finance-summary"><h3>สรุปการเงินของแพลตฟอร์ม</h3><div class="finance-grid"><div><small>ค่าบริการที่เก็บแล้ว</small><strong>฿${formatBaht(financeSummary?.service_fee_collected || 0)}</strong></div><div><small>ค่าบริการรอชำระ</small><strong>฿${formatBaht(financeSummary?.service_fee_awaiting || 0)}</strong></div><div><small>ค้างโอนให้เจ้าของ</small><strong>฿${formatBaht(financeSummary?.payouts_pending || 0)}</strong></div><div><small>โอนให้เจ้าของแล้ว</small><strong>฿${formatBaht(financeSummary?.payouts_paid || 0)}</strong></div><div><small>เงินมัดจำที่ถืออยู่</small><strong>฿${formatBaht(financeSummary?.deposits_held || 0)}</strong></div><div><small>คืนมัดจำแล้ว</small><strong>฿${formatBaht(financeSummary?.deposits_refunded || 0)}</strong></div></div><p class="form-footnote">ตัวเลขมาจากสถานะที่แอดมินบันทึกในระบบ ไม่ใช่ยอดจากบัญชีธนาคาร</p></section>`
    : '';
  const adminPaymentSetup = admin
    ? `<section class="payment-settings"><h3>PromptPay สำหรับรับชำระ</h3><p class="form-footnote">ผู้เช่าจะเห็น QR พร้อมยอดที่ต้องจ่ายอัตโนมัติ (ต้องบันทึกคำแนะนำการชำระเงินด้านบนก่อน)</p><form id="promptpaySettingsForm"><div class="form-grid"><div class="form-field"><label for="promptpayId">เบอร์มือถือ / เลขประจำตัว 13 หลัก / e-Wallet 15 หลัก</label><input id="promptpayId" name="promptpay_id" inputmode="numeric" maxlength="20" value="${escapeHTML(promptpayId)}" placeholder="เช่น 0812345678"></div><div class="form-field"><label for="promptpayName">ชื่อบัญชีที่แสดงในแอปธนาคาร</label><input id="promptpayName" name="promptpay_name" maxlength="100" value="${escapeHTML(promptpayName)}" placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"></div></div><div class="form-actions"><button type="submit" class="btn btn-primary">บันทึก PromptPay</button>${promptpayId?'<button type="button" class="btn btn-danger" data-action="clear-promptpay">ลบ PromptPay</button>':''}</div></form></section>
      <section class="payment-settings"><h3>ค่าบริการแพลตฟอร์ม</h3><p class="form-footnote">ใช้กับคำขอจองใหม่เท่านั้น รายการจองเดิมใช้ค่าบริการที่บันทึกไว้ตอนจอง · ตอนนี้: ${escapeHTML(feeSettingsText(feeSettings))}</p><form id="platformFeeForm"><div class="form-grid"><div class="form-field"><label for="feePercent">เปอร์เซ็นต์ของค่าเช่า (0–30)</label><input id="feePercent" name="fee_percent" type="number" min="0" max="30" step="0.5" required value="${escapeHTML(String(feeSettings.fee_percent))}"></div><div class="form-field"><label for="feeMin">ค่าบริการขั้นต่ำ (บาท)</label><input id="feeMin" name="min_fee" type="number" min="0" max="1000" step="1" required value="${escapeHTML(String(feeSettings.min_fee))}"></div></div><div class="form-actions"><button type="submit" class="btn btn-primary">บันทึกค่าบริการ</button></div></form></section>`
    : '';
  if (admin) {
    const adminRows = payments.slice();
    const existingPaymentTypes = new Set(payments.map(payment => `${payment.booking_id}:${payment.payment_type}`));
    for (const booking of relevantBookings) {
      for (const type of ['rent','deposit']) {
        const amount = type === 'rent' ? rentDue(booking) : Number(booking.deposit);
        if (amount > 0 && !existingPaymentTypes.has(`${booking.id}:${type}`)) {
          adminRows.push({
            id:`unpaid:${booking.id}:${type}`,
            booking_id:booking.id,
            payer_id:booking.renter_id,
            payment_type:type,
            amount,
            status:'unpaid',
            submitted_at:null
          });
        }
      }
    }
    const adminPayments = adminRows.map(payment => {
      const booking = bookingRows.find(row => row.id === payment.booking_id);
      const listing = booking ? listingMap[booking.listing_id] : null;
      const user = userMap[payment.payer_id];
      const payerName = user?.full_name || profileMap[payment.payer_id] || 'สมาชิก';
      const search = `${payment.id} ${payment.booking_id} ${payment.payer_id} ${payerName} ${user?.email || ''}`.toLocaleLowerCase('th-TH');
      const events = (eventsByPayment[payment.id] || []).map(event => `<li><span>${escapeHTML(paymentStatusLabels[event.to_status] || event.to_status)}</span><small>${escapeHTML(formatTime(event.created_at))} · ${escapeHTML(event.actor_id?(userMap[event.actor_id]?.full_name||profileMap[event.actor_id]||'สมาชิก'):'ระบบ')}${event.note?` · ${escapeHTML(event.note)}`:''}</small></li>`).join('');
      const actions = [
        payment.status === 'pending_verification' ? `<button class="btn btn-secondary" data-action="payment-proof" data-id="${escapeHTML(payment.id)}">ดูหลักฐาน</button><button class="btn btn-primary" data-action="payment-review" data-id="${escapeHTML(payment.id)}" data-status="paid">ยืนยันหลักฐาน</button><button class="btn btn-danger" data-action="payment-review" data-id="${escapeHTML(payment.id)}" data-status="rejected">ปฏิเสธ</button>` : '',
        payment.status === 'refund_pending' ? `<button class="btn btn-primary" data-action="payment-refund" data-id="${escapeHTML(payment.id)}">บันทึกผลคืนเงิน</button>` : ''
      ].filter(Boolean).join('');
      return `<article class="account-row admin-payment-row" data-payment-search="${escapeHTML(search)}" data-payment-status="${escapeHTML(payment.status)}"><div><h3>${escapeHTML(paymentTypeLabels[payment.payment_type] || payment.payment_type)} · ฿${formatBaht(payment.amount)}</h3><p>ประกาศ: ${escapeHTML(listing?.title || 'ไม่พบประกาศ')} · ผู้เช่า: ${escapeHTML(payerName)} ${user?.email?`(${escapeHTML(user.email)})`:''}</p>${booking?`<p>ช่วงเช่า: ${formatDateThai(booking.start_date)} – ${formatDateThai(booking.end_date)} · สถานะจอง ${escapeHTML(statusText(booking.status))}</p>`:''}<p>รหัสจอง: <code>${escapeHTML(payment.booking_id)}</code>${payment.status==='unpaid'?'':` · รหัสหลักฐาน: <code>${escapeHTML(payment.id)}</code>`}</p><p>${payment.submitted_at?`ส่งเมื่อ ${escapeHTML(formatTime(payment.submitted_at))}`:'ยังไม่มีหลักฐาน'} · <span class="status-pill ${paymentStatusClass(payment.status)}">${escapeHTML(paymentStatusLabels[payment.status] || payment.status)}</span></p>${payment.review_note?`<p>หมายเหตุผู้ตรวจ: ${escapeHTML(payment.review_note)}</p>`:''}${payment.refund_note?`<p>บันทึกคืนเงิน: ${escapeHTML(payment.refund_note)}</p>`:''}<details class="payment-history"><summary>ประวัติการเปลี่ยนสถานะ</summary><ol>${events || '<li>ยังไม่มีประวัติ</li>'}</ol></details></div><div class="account-actions">${actions}</div></article>`;
    }).join('');
    out.innerHTML = `${adminFinancePanel}${settingsPanel}${adminPaymentSetup}${payoutSection}<form id="adminPaymentFilterForm" class="payment-filter"><div class="form-field"><label for="adminPaymentSearch">ค้นหารหัสจอง / รหัสผู้ใช้ / ชื่อ / อีเมล</label><input id="adminPaymentSearch" name="search" type="search" placeholder="ระบุรหัสหรือชื่อ"></div><div class="form-field"><label for="adminPaymentStatus">สถานะ</label><select id="adminPaymentStatus" name="status"><option value="">ทุกสถานะ</option>${Object.entries(paymentStatusLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div><button class="btn btn-secondary" type="submit">ค้นหา</button></form><div id="adminPaymentList" class="account-list">${adminPayments || '<div class="account-empty">ยังไม่มีรายการชำระเงินในช่วงที่แสดง</div>'}</div>`;
    return;
  }
  const userIsRenter = relevantBookings.some(row => row.renter_id === currentSession.user.id);
  const bookingCards = relevantBookings.map(booking => {
    const listing = listingMap[booking.listing_id];
    const renter = profileMap[booking.renter_id] || 'สมาชิก';
    const recordsFor = type => paymentMap.get(`${booking.id}:${type}`) || [];
    const renderType = type => {
      const history = recordsFor(type);
      const latest = history[0];
      const amount = type === 'rent' ? rentDue(booking) : (booking.deposit == null ? null : Number(booking.deposit));
      const status = latest?.status || 'unpaid';
      const canSubmit = userIsRenter && booking.renter_id === currentSession.user.id
        && ['approved','completed'].includes(booking.status) && amount > 0 && !['pending_verification','paid','refund_pending','refunded'].includes(status)
        && Boolean(instructions);
      const historyHtml = history.map(payment => {
        const audit = (eventsByPayment[payment.id] || []).map(event => `<li>${escapeHTML(paymentStatusLabels[event.to_status] || event.to_status)} · ${escapeHTML(formatTime(event.created_at))} · ${escapeHTML(event.actor_id?(userMap[event.actor_id]?.full_name||profileMap[event.actor_id]||'สมาชิก'):'ระบบ')}${event.note?` · ${escapeHTML(event.note)}`:''}</li>`).join('');
        const proofAction = booking.renter_id === currentSession.user.id
          ? `<button class="btn btn-secondary" data-action="payment-proof" data-id="${escapeHTML(payment.id)}">ดูหลักฐานที่ส่ง</button>`
          : '';
        return `<div class="payment-attempt"><p>หลักฐาน ${escapeHTML(formatTime(payment.submitted_at))} · <span class="status-pill ${paymentStatusClass(payment.status)}">${escapeHTML(paymentStatusLabels[payment.status] || payment.status)}</span></p>${payment.review_note?`<p>หมายเหตุ: ${escapeHTML(payment.review_note)}</p>`:''}${payment.refund_note?`<p>บันทึกการคืนเงิน: ${escapeHTML(payment.refund_note)}</p>`:''}<div class="account-actions">${proofAction}</div><details class="payment-history"><summary>ประวัติ</summary><ol>${audit}</ol></details></div>`;
      }).join('');
      const amountText = amount == null ? 'ไม่มีข้อมูล snapshot เงินมัดจำของรายการเดิม' : `฿${formatBaht(amount)}`;
      const action = canSubmit
        ? `<button class="btn btn-primary" data-action="submit-payment" data-id="${escapeHTML(booking.id)}" data-type="${type}">แนบหลักฐาน${type==='rent'?'ค่าเช่า':'เงินมัดจำ'}</button>`
        : userIsRenter && booking.renter_id === currentSession.user.id && ['approved','completed'].includes(booking.status) && status === 'unpaid' && !instructions
          ? '<small>ยังส่งหลักฐานไม่ได้จนกว่าแอดมินจะตั้งค่าคำแนะนำ</small>'
          : '';
      return `<div class="payment-type-row"><div><strong>${escapeHTML(paymentTypeLabels[type])}: ${amountText}</strong><p>สถานะ: <span class="status-pill ${paymentStatusClass(status)}">${escapeHTML(paymentStatusLabels[status])}</span></p>${historyHtml}</div><div class="account-actions">${action}</div></div>`;
    };
    const renterCanPay = booking.renter_id === currentSession.user.id;
    return `<article class="account-row payment-booking-row"><div><h3>${escapeHTML(listing?.title || 'ประกาศสินค้า')}</h3><p>ผู้เช่า: ${escapeHTML(renterCanPay?'คุณ':renter)} · ${formatDateThai(booking.start_date)} – ${formatDateThai(booking.end_date)} · การจอง ${escapeHTML(statusText(booking.status))}</p><p>ค่าเช่ารวม ฿${formatBaht(booking.total_price)} · ค่าบริการแพลตฟอร์ม ${booking.service_fee==null?'ไม่มี (รายการจองเดิม)':`฿${formatBaht(booking.service_fee)}`} · มัดจำ ${booking.deposit==null?'ไม่บันทึกข้อมูลเดิม':`฿${formatBaht(booking.deposit)}`}</p></div><div class="payment-types">${renderType('rent')}${booking.deposit==null || Number(booking.deposit)>0?renderType('deposit'):'<p class="form-footnote">ไม่มีเงินมัดจำที่ต้องชำระ</p>'}</div></article>`;
  }).join('');
  out.innerHTML = `${settingsPanel}${payoutSection}${bookingCards || '<div class="account-empty">ยังไม่มีรายการจองที่อนุมัติหรือเสร็จสิ้น จึงยังไม่มีข้อมูลการชำระเงิน</div>'}`;
}
async function openPaymentSubmission(bookingId, paymentType) {
  if (!currentSession?.user) return openAuthModal('login');
  const [bookingResult, settingsResult] = await Promise.all([
    supabase.from('bookings').select('id,listing_id,renter_id,status,total_price,service_fee,deposit,start_date,end_date').eq('id',bookingId).maybeSingle(),
    supabase.from('payment_settings').select('instructions,promptpay_id,promptpay_name').eq('id',1).maybeSingle()
  ]);
  if (bookingResult.error) return showToast('โหลดรายการจองไม่ได้: ' + friendlyError(bookingResult.error));
  if (settingsResult.error) return showToast('โหลดคำแนะนำการชำระเงินไม่ได้: ' + friendlyError(settingsResult.error));
  const booking = bookingResult.data;
  if (!booking || booking.renter_id !== currentSession.user.id) return showToast('ไม่พบรายการจองหรือคุณไม่มีสิทธิ์ส่งหลักฐาน');
  if (!['approved','completed'].includes(booking.status)) return showToast('ส่งหลักฐานได้หลังเจ้าของอนุมัติการจองแล้วเท่านั้น');
  const amount = paymentType === 'rent' ? rentDue(booking) : Number(booking.deposit);
  if (paymentType === 'deposit' && booking.deposit == null) return showToast('รายการจองเดิมไม่มีข้อมูล snapshot เงินมัดจำ กรุณาติดต่อผู้ดูแล');
  if (!Number.isFinite(amount) || amount <= 0) return showToast('ไม่มียอดที่ต้องแจ้งชำระสำหรับรายการนี้');
  if (!settingsResult.data?.instructions) return showToast('แอดมินยังไม่ได้ตั้งค่าคำแนะนำการชำระเงิน');
  const {data:listing,error:listingError}=await supabase.from('listings').select('title').eq('id',booking.listing_id).maybeSingle();
  if(listingError) return showToast('โหลดประกาศไม่ได้: '+friendlyError(listingError));
  openModal('แนบหลักฐานการชำระเงิน',`${paymentTypeLabels[paymentType]} · ${listing?.title || 'รายการจอง'}`,`<form id="paymentProofForm" data-booking-id="${escapeHTML(booking.id)}" data-type="${paymentType}"><div class="payment-settings"><h3>คำแนะนำจากแอดมิน</h3><p>${escapeHTML(settingsResult.data.instructions).replace(/\n/g,'<br>')}</p></div><p><strong>ยอด ${escapeHTML(paymentTypeLabels[paymentType])}: ฿${formatBaht(amount)}</strong></p>${paymentType==='rent'&&booking.service_fee!=null?`<p class="form-footnote">ค่าเช่า ฿${formatBaht(booking.total_price)} + ค่าบริการแพลตฟอร์ม ฿${formatBaht(booking.service_fee)}</p>`:''}<div id="promptpayBox"></div><p class="form-footnote">การแนบสลิปเป็นเพียงการส่งหลักฐาน รอผู้ดูแลตรวจสอบก่อนสถานะจึงจะเปลี่ยน ไม่ใช่การยืนยันจากธนาคารหรือ Payment Gateway</p><div class="form-field"><label for="paymentProofFile">รูปหลักฐาน *</label><input id="paymentProofFile" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required><small>JPG, PNG หรือ WebP · ไม่เกิน 5 MB</small></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">ส่งหลักฐานเพื่อตรวจสอบ</button></div></form>`);
  renderPromptPayBox($('#promptpayBox'), settingsResult.data.promptpay_id, settingsResult.data.promptpay_name, amount);
}
async function submitPaymentProof(form) {
  if (!currentSession?.user) return openAuthModal('login');
  const file = new FormData(form).get('proof');
  if (!(file instanceof File) || !file.size) return showToast('กรุณาเลือกรูปหลักฐาน');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  let path = null;
  try {
    path = await uploadPaymentProof(file, form.dataset.bookingId);
    const { error } = await supabase.rpc('submit_booking_payment', {
      p_booking_id:form.dataset.bookingId,
      p_payment_type:form.dataset.type,
      p_proof_path:path
    });
    if (error) throw error;
  } catch (error) {
    if (path) {
      const { error:removeError } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([path]);
      if (removeError) console.error('ลบไฟล์หลักฐานที่บันทึกไม่สำเร็จไม่สำเร็จ',removeError);
    }
    button.disabled = false;
    return showToast('ส่งหลักฐานไม่สำเร็จ: ' + friendlyError(error));
  }
  closeModal();
  showToast('ส่งหลักฐานแล้ว · สถานะรอตรวจสอบ ยังไม่ถือว่าชำระสำเร็จ');
  await renderAccountTab('payments');
  await refreshNotificationCount();
}
async function openPaymentProof(paymentId) {
  if (!currentSession?.user) return openAuthModal('login');
  const {data:path,error}=await supabase.rpc('booking_payment_proof_path',{p_payment_id:paymentId});
  if(error) return showToast('โหลดหลักฐานไม่สำเร็จ: '+friendlyError(error));
  if(!path) return showToast('ไม่พบหลักฐานนี้');
  const {data,error:signError}=await supabase.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path,300);
  if(signError) return showToast('เปิดรูปหลักฐานไม่สำเร็จ: '+friendlyError(signError));
  openModal('หลักฐานการชำระเงิน','ลิงก์ส่วนตัวนี้หมดอายุใน 5 นาที',`<img class="payment-proof-image" src="${escapeHTML(data.signedUrl)}" alt="หลักฐานการชำระเงิน">`);
}
async function reviewPayment(form) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์ตรวจสอบการชำระเงิน');
  const data=new FormData(form);
  const {error}=await supabase.rpc('admin_review_booking_payment',{
    p_payment_id:form.dataset.id,
    p_status:form.dataset.status,
    p_note:String(data.get('note')||'').trim()||null
  });
  if(error) return showToast('บันทึกผลตรวจสอบไม่สำเร็จ: '+friendlyError(error));
  closeModal();
  showToast(form.dataset.status==='paid'?'บันทึกผลตรวจหลักฐานแล้ว':'ปฏิเสธหลักฐานพร้อมเหตุผลแล้ว');
  await renderAccountTab('admin-payments');
}
function openPaymentReview(paymentId,status) {
  if(!['paid','rejected'].includes(status)) return;
  openModal(status==='paid'?'ยืนยันผลตรวจหลักฐาน':'ปฏิเสธหลักฐาน','การยืนยันนี้เป็นผลตรวจโดยแอดมิน ไม่ใช่การตรวจจาก Payment Gateway',`<form id="paymentReviewForm" data-id="${escapeHTML(paymentId)}" data-status="${status}"><div class="form-field"><label for="paymentReviewNote">${status==='rejected'?'เหตุผลที่ไม่ผ่าน (จำเป็น)':'หมายเหตุการตรวจสอบ (ไม่บังคับ)'}</label><textarea id="paymentReviewNote" name="note" maxlength="1000" ${status==='rejected'?'required minlength="5"':''} placeholder="${status==='rejected'?'ระบุสาเหตุและสิ่งที่ควรแก้ไข':''}"></textarea></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn ${status==='paid'?'btn-primary':'btn-danger'}">${status==='paid'?'บันทึกว่าตรวจสอบแล้ว':'ยืนยันปฏิเสธ'}</button></div></form>`);
}
function openDepositRefund(paymentId) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์จัดการคืนเงิน');
  openModal('บันทึกผลคืนเงินมัดจำ','ต้องดำเนินการคืนเงินจริงนอกระบบให้เสร็จก่อน แล้วจึงบันทึกผลนี้',`<form id="depositRefundForm" data-id="${escapeHTML(paymentId)}"><label class="report-hide-review"><input type="checkbox" name="transferCompleted" required> ยืนยันว่าได้ดำเนินการคืนเงินจริงแล้ว</label><div class="form-field"><label for="depositRefundNote">หมายเหตุ / เลขอ้างอิงที่ไม่ใช่ข้อมูลลับ *</label><textarea id="depositRefundNote" name="note" required minlength="5" maxlength="1000" placeholder="บันทึกวันเวลาและ reference ที่ไม่ใช่เลขบัญชีหรือข้อมูลลับ"></textarea></div><p class="form-footnote">ระบบจะบันทึกผู้ดำเนินการและเวลา แต่ไม่ได้โอนเงินจริง</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกผลคืนเงินจริง</button></div></form>`);
}
async function recordDepositRefund(form) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์จัดการคืนเงิน');
  const data=new FormData(form);
  const {error}=await supabase.rpc('admin_record_deposit_refund',{
    p_payment_id:form.dataset.id,
    p_note:String(data.get('note')||'').trim(),
    p_transfer_completed:data.get('transferCompleted')==='on'
  });
  if(error) return showToast('บันทึกการคืนเงินไม่สำเร็จ: '+friendlyError(error));
  closeModal();
  showToast('บันทึกผลคืนเงินมัดจำแล้ว');
  await renderAccountTab('admin-payments');
}
function openOwnerPayout(payoutId) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์บันทึกการโอนให้เจ้าของ');
  openModal('บันทึกการโอนค่าเช่าให้เจ้าของ','โอนเงินให้เจ้าของนอกระบบให้เสร็จก่อน แล้วจึงบันทึกผลนี้',`<form id="ownerPayoutForm" data-id="${escapeHTML(payoutId)}"><label class="report-hide-review"><input type="checkbox" name="transferCompleted" required> ยืนยันว่าโอนเงินให้เจ้าของจริงแล้ว</label><div class="form-field"><label for="ownerPayoutNote">หมายเหตุ / เลขอ้างอิงที่ไม่ใช่ข้อมูลลับ *</label><textarea id="ownerPayoutNote" name="note" required minlength="5" maxlength="1000" placeholder="เช่น โอน PromptPay 24/10 14:30 ref 1234"></textarea></div><p class="form-footnote">ระบบจะแจ้งเจ้าของและบันทึกผู้ดำเนินการกับเวลา แต่ไม่ได้โอนเงินจริง</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกการโอน</button></div></form>`);
}
async function recordOwnerPayout(form) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์บันทึกการโอนให้เจ้าของ');
  const data=new FormData(form);
  const {error}=await supabase.rpc('admin_record_owner_payout',{
    p_payout_id:form.dataset.id,
    p_note:String(data.get('note')||'').trim(),
    p_transfer_completed:data.get('transferCompleted')==='on'
  });
  if(error) return showToast('บันทึกการโอนไม่สำเร็จ: '+friendlyError(error));
  closeModal();
  showToast('บันทึกการโอนให้เจ้าของแล้ว');
  await renderAccountTab('admin-payments');
}
async function savePromptPaySettings(form, clear=false) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์ตั้งค่าการชำระเงิน');
  const data=form?new FormData(form):null;
  const id=clear?'':String(data.get('promptpay_id')||'');
  const name=clear?'':String(data.get('promptpay_name')||'');
  if(id.trim() && !isValidPromptPayId(id)) return showToast('PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก');
  const {error}=await supabase.rpc('admin_update_promptpay',{p_promptpay_id:id||null,p_promptpay_name:name||null});
  if(error) return showToast('บันทึก PromptPay ไม่สำเร็จ: '+friendlyError(error));
  showToast(clear||!id.trim()?'ลบ PromptPay แล้ว':'บันทึก PromptPay แล้ว');
  await renderAccountTab('admin-payments');
}
async function savePlatformFee(form) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์ตั้งค่าค่าบริการ');
  const data=new FormData(form);
  const percent=Number(data.get('fee_percent'));
  const minFee=Number(data.get('min_fee'));
  if(!Number.isFinite(percent)||percent<0||percent>30) return showToast('เปอร์เซ็นต์ต้องอยู่ระหว่าง 0 ถึง 30');
  if(!Number.isFinite(minFee)||minFee<0||minFee>1000) return showToast('ค่าบริการขั้นต่ำต้องอยู่ระหว่าง 0 ถึง 1,000 บาท');
  const {error}=await supabase.rpc('admin_update_platform_fee',{p_fee_percent:percent,p_min_fee:minFee});
  if(error) return showToast('บันทึกค่าบริการไม่สำเร็จ: '+friendlyError(error));
  showToast('บันทึกค่าบริการแล้ว ใช้กับคำขอจองใหม่');
  await renderAccountTab('admin-payments');
}
async function savePaymentInstructions(form,instructionsOverride=null) {
  if(!currentIsAdmin) return showToast('ไม่มีสิทธิ์ตั้งค่าการชำระเงิน');
  const instructions=instructionsOverride ?? String(new FormData(form).get('instructions')||'');
  const {error}=await supabase.rpc('admin_update_payment_instructions',{p_instructions:instructions});
  if(error) return showToast('บันทึกคำแนะนำไม่สำเร็จ: '+friendlyError(error));
  showToast(instructions.trim()?'บันทึกคำแนะนำการชำระเงินแล้ว':'ลบคำแนะนำการชำระเงินแล้ว');
  await renderAccountTab('admin-payments');
}
function filterAdminPayments(form) {
  const data=new FormData(form);
  const search=String(data.get('search')||'').trim().toLocaleLowerCase('th-TH');
  const status=String(data.get('status')||'');
  const rows=$$('#adminPaymentList .admin-payment-row');
  let visible=0;
  for(const row of rows) {
    const matches=(!search||row.dataset.paymentSearch.includes(search))&&(!status||row.dataset.paymentStatus===status);
    row.hidden=!matches;
    if(matches) visible++;
  }
  const empty=$('#adminPaymentList .account-empty');
  if(!visible&&!empty) $('#adminPaymentList').insertAdjacentHTML('beforeend','<div class="account-empty" data-filter-empty>ไม่พบรายการที่ตรงกับตัวกรอง</div>');
  if(visible) $('#adminPaymentList [data-filter-empty]')?.remove();
}
function openAccountDashboard(tab=currentIsAdmin?'admin-overview':'my-listings') {
  if (!liveMode) return openAuthModal('login');
  if (!currentSession?.user) return openAuthModal('login');
  accountTab = tab;
  const name = currentProfile?.full_name || currentSession.user.user_metadata?.full_name || currentSession.user.email || 'สมาชิก';
  openModal(tab === 'profile' ? 'โปรไฟล์ของฉัน' : currentIsAdmin ? 'แผงควบคุมแอดมิน' : 'บัญชีของฉัน', `สวัสดี ${name} · ${currentIsAdmin?'จัดการข้อมูลแพลตฟอร์ม':'จัดการประกาศและคำขอจอง'}`, accountShell(tab), true);
  renderAccountTab(tab);
}
async function renderAdminTab(tab, out) {
  if (!currentIsAdmin) { out.innerHTML='<div class="account-empty">บัญชีนี้ไม่มีสิทธิ์แอดมิน</div>'; return; }
  if (tab === 'admin-overview') {
    const [users, listings, bookings] = await Promise.all([
      supabase.from('profiles').select('id',{count:'exact',head:true}),
      supabase.from('listings').select('id',{count:'exact',head:true}),
      supabase.from('bookings').select('id',{count:'exact',head:true})
    ]);
    for (const result of [users,listings,bookings]) if (result.error) throw result.error;
    out.innerHTML = `<div class="admin-stat-grid"><div class="admin-stat"><span>สมาชิก</span><strong>${users.count||0}</strong></div><div class="admin-stat"><span>ประกาศทั้งหมด</span><strong>${listings.count||0}</strong></div><div class="admin-stat"><span>คำขอจองทั้งหมด</span><strong>${bookings.count||0}</strong></div></div><div class="account-row admin-welcome"><div><h3>ยินดีต้อนรับผู้ดูแลระบบ</h3><p>บัญชีแอดมินสามารถตรวจสอบสมาชิก ประกาศ และคำขอจองทั้งหมดที่บันทึกไว้ใน Supabase ได้</p><p>สิทธิ์ถูกตรวจสอบจากฐานข้อมูล ไม่ได้อาศัยชื่อที่แสดงบนหน้าเว็บ</p></div></div><div class="admin-shortcuts"><button class="btn btn-secondary" data-action="account-tab" data-tab="admin-listings">จัดการประกาศทั้งหมด</button><button class="btn btn-secondary" data-action="account-tab" data-tab="admin-bookings">ตรวจสอบการจอง</button><button class="btn btn-secondary" data-action="account-tab" data-tab="admin-users">ดูข้อมูลสมาชิก</button></div>`;
    return;
  }
  if (tab === 'admin-listings') {
    const {data,error}=await supabase.from('listings').select('*, profiles!listings_owner_id_fkey(full_name)').order('created_at',{ascending:false});
    if(error) throw error;
    if(!data?.length){out.innerHTML='<div class="account-empty">ยังไม่มีประกาศในระบบ</div>';return;}
    out.innerHTML=`<div class="account-list">${data.map(row=>`<div class="account-row"><div><h3>${escapeHTML(row.title)}</h3><p>ผู้ลงประกาศ: ${escapeHTML(row.profiles?.full_name||'สมาชิก')} · ${escapeHTML(row.location||'ยังไม่ได้ระบุตำแหน่ง')} · ฿${formatBaht(row.price_per_day)} / วัน</p><p><span class="status-pill ${row.is_available?'approved':'cancelled'}">${row.is_available?'เปิดให้เช่า':'ซ่อนประกาศ'}</span> · ${formatDateThai(String(row.created_at||'').slice(0,10))}</p></div><div class="account-actions"><button class="btn btn-secondary" data-action="edit-listing" data-id="${row.id}">แก้ไข</button><button class="btn btn-secondary" data-action="toggle-listing" data-id="${row.id}" data-available="${row.is_available}">${row.is_available?'ซ่อนประกาศ':'เปิดให้เช่า'}</button><button class="btn btn-danger" data-action="delete-listing" data-id="${row.id}">ลบ</button></div></div>`).join('')}</div>`;
    return;
  }
  if (tab === 'admin-users') {
    const {data,error}=await supabase.rpc('admin_list_users');
    if(error) throw error;
    if(!data?.length){out.innerHTML='<div class="account-empty">ยังไม่พบข้อมูลสมาชิก</div>';return;}
    out.innerHTML=`<div class="account-list">${data.map(user=>`<div class="account-row"><div><h3>${escapeHTML(user.full_name||'สมาชิก')}</h3><p>อีเมล: ${escapeHTML(user.email||'-')}</p><p>สถานศึกษา: ${escapeHTML(user.university||'-')}</p><p>สมัครเมื่อ ${formatDateThai(String(user.created_at||'').slice(0,10))} · ${user.is_admin?'<span class="status-pill approved">แอดมิน</span>':'<span class="status-pill">สมาชิก</span>'}</p></div></div>`).join('')}</div>`;
    return;
  }
  if (tab === 'admin-bookings') {
    const {data:rows,error}=await supabase.from('bookings').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    if(!rows?.length){out.innerHTML='<div class="account-empty">ยังไม่มีคำขอจองในระบบ</div>';return;}
    const itemIds=[...new Set(rows.map(row=>row.listing_id))];
    const userIds=[...new Set(rows.map(row=>row.renter_id))];
    const [{data:listings,error:listError},{data:profiles,error:profilesError},{data:users,error:usersError}]=await Promise.all([
      supabase.from('listings').select('id,title,owner_id,location,price_per_day,deposit,image_url,profiles!listings_owner_id_fkey(full_name)').in('id',itemIds),
      supabase.from('profiles').select('id,full_name').in('id',userIds),
      supabase.rpc('admin_list_users')
    ]);
    if(listError) throw listError; if(profilesError) throw profilesError; if(usersError) throw usersError;
    const itemMap=Object.fromEntries((listings||[]).map(item=>[item.id,item]));
    const userMap=Object.fromEntries((users||[]).map(user=>[user.user_id,user]));
    const renterNames=Object.fromEntries((profiles||[]).map(profile=>[profile.id,`${profile.full_name||userMap[profile.id]?.full_name||'สมาชิก'} · ${userMap[profile.id]?.email||'-'}`]));
    out.innerHTML=renderBookingRows(rows,itemMap,'admin',renterNames);
    return;
  }
  if (tab === 'admin-reports') {
    await renderIssueReports(out, true);
    return;
  }
  if (tab === 'admin-payments') {
    await renderPayments(out, true);
    return;
  }
  out.innerHTML='<div class="account-empty">ไม่พบหน้าจัดการที่ต้องการ</div>';
}
async function renderAccountTab(tab) {
  if (!liveMode || !currentSession?.user || !$('#accountContent')) return;
  accountTab = tab;
  $$('.account-tab[data-action="account-tab"]').forEach(btn => { const active=btn.dataset.tab===tab; btn.classList.toggle('active',active); btn.setAttribute('aria-pressed',String(active)); });
  const out = $('#accountContent'); out.innerHTML='<div class="account-empty">กำลังโหลดข้อมูล…</div>';
  const uid = currentSession.user.id;
  try {
    if (tab.startsWith('admin-')) { await renderAdminTab(tab, out); return; }
    if (tab === 'inbox') { await refreshConversationList(); return; }
    if (tab === 'my-reports') { await renderIssueReports(out); return; }
    if (tab === 'profile') { await renderProfileSettings(out); return; }
    if (tab === 'payments') { await renderPayments(out); return; }
    if (tab === 'my-wanted') {
      const { data:requests, error } = await supabase.from('wanted_requests')
        .select('id,title,category,budget_per_day,requested_date,duration,pickup_zone,status,created_at')
        .eq('owner_id', uid).order('created_at', { ascending:false });
      if (error) throw error;
      if (!requests?.length) { out.innerHTML='<div class="account-empty">คุณยังไม่ได้เผยแพร่ความต้องการ</div>'; return; }
      const ids = requests.map(request => request.id);
      const { data:offers, error:offerError } = await supabase.from('wanted_offers')
        .select('wanted_request_id,status').in('wanted_request_id', ids);
      if (offerError) throw offerError;
      const offerCounts = {};
      for (const offer of offers || []) offerCounts[offer.wanted_request_id] = (offerCounts[offer.wanted_request_id] || 0) + 1;
      out.innerHTML = `<div class="account-list">${requests.map(request => `<div class="account-row"><div><h3>${escapeHTML(request.title)}</h3><p>${escapeHTML(categoryLabels[request.category] || 'อื่น ๆ')} · งบ ฿${formatBaht(request.budget_per_day)}/วัน · ${formatDateThai(request.requested_date)} · ${escapeHTML(request.duration)}</p><p>โซนรับ: ${escapeHTML(request.pickup_zone)} · ${offerCounts[request.id] || 0} ข้อเสนอ · <span class="status-pill ${request.status==='open'?'approved':'cancelled'}">${request.status==='open'?'เปิดรับข้อเสนอ':'ปิดรับแล้ว'}</span></p></div><div class="account-actions">${request.status==='open'?`<button class="btn btn-secondary" data-action="close-wanted" data-id="${escapeHTML(request.id)}">ปิดรับข้อเสนอ</button>`:''}</div></div>`).join('')}</div>`;
      return;
    }
    if (tab === 'incoming-offers') {
      const { data:requests, error:requestError } = await supabase.from('wanted_requests')
        .select('id,title').eq('owner_id', uid);
      if (requestError) throw requestError;
      if (!requests?.length) { out.innerHTML='<div class="account-empty">เมื่อคุณเผยแพร่ความต้องการ ข้อเสนอจากสมาชิกจะแสดงที่นี่</div>'; return; }
      const requestById = Object.fromEntries(requests.map(request => [request.id, request]));
      const { data:offers, error:offerError } = await supabase.from('wanted_offers')
        .select('id,wanted_request_id,offerer_id,listing_id,message,status,created_at,profiles!wanted_offers_offerer_id_fkey(full_name)')
        .in('wanted_request_id', requests.map(request => request.id))
        .order('created_at', { ascending:false });
      if (offerError) throw offerError;
      if (!offers?.length) { out.innerHTML='<div class="account-empty">ยังไม่มีข้อเสนอสำหรับความต้องการของคุณ</div>'; return; }
      const listingIds = [...new Set(offers.map(offer => offer.listing_id).filter(Boolean))];
      const { data:listings, error:listingError } = listingIds.length
        ? await supabase.from('listings').select('id,title,owner_id').in('id', listingIds)
        : { data:[], error:null };
      if (listingError) throw listingError;
      const listingById = Object.fromEntries((listings || []).map(listing => [listing.id, listing]));
      out.innerHTML = `<div class="account-list">${offers.map(offer => {
        const listing = listingById[offer.listing_id];
        return `<div class="account-row"><div><h3>${escapeHTML(requestById[offer.wanted_request_id]?.title || 'ความต้องการ')}</h3><p>ข้อเสนอจาก ${escapeHTML(offer.profiles?.full_name || 'สมาชิก')}${listing?` · <button class="text-action" data-action="open-listing-detail" data-id="${escapeHTML(listing.id)}">${escapeHTML(listing.title)}</button>`:' · ไม่มีประกาศสินค้าแนบ'}</p><p>${escapeHTML(offer.message)}</p><p>${formatTime(offer.created_at)} · <span class="status-pill ${escapeHTML(offer.status)}">${offer.status==='pending'?'รอตอบรับ':offer.status==='accepted'?'ตอบรับแล้ว':'ปฏิเสธแล้ว'}</span></p></div><div class="account-actions">${offer.status==='pending'?`<button class="btn btn-primary" data-action="offer-accept" data-id="${escapeHTML(offer.id)}">ตอบรับข้อเสนอ</button><button class="btn btn-danger" data-action="offer-decline" data-id="${escapeHTML(offer.id)}">ปฏิเสธ</button>`:''}${listing?`<button class="btn btn-secondary" data-action="offer-chat" data-listing-id="${escapeHTML(listing.id)}">แชตกับผู้เสนอ</button>`:'<span class="hint">แนบประกาศเพื่อเริ่มแชต</span>'}</div></div>`;
      }).join('')}</div>`;
      return;
    }
    if (tab === 'my-listings') {
      const {data,error}=await supabase.from('listings').select('*').eq('owner_id',uid).order('created_at',{ascending:false});
      if(error) throw error;
      if(!data?.length){out.innerHTML='<div class="account-empty">คุณยังไม่มีประกาศ กดปุ่ม “ลงประกาศปล่อยเช่า” เพื่อเพิ่มรายการแรก</div>';return;}
      out.innerHTML=`<div class="account-list">${data.map(row=>`<div class="account-row"><div><h3>${escapeHTML(row.title)}</h3><p>฿${formatBaht(row.price_per_day)} / วัน · ${escapeHTML(row.location||'ยังไม่ได้ระบุตำแหน่ง')}</p><p><span class="status-pill ${row.is_available?'approved':'cancelled'}">${row.is_available?'เปิดให้เช่า':'ซ่อนประกาศ'}</span> · เพิ่มเมื่อ ${formatDateThai(String(row.created_at||'').slice(0,10))}</p></div><div class="account-actions"><button class="btn btn-secondary" data-action="edit-listing" data-id="${row.id}">แก้ไข</button><button class="btn btn-secondary" data-action="toggle-listing" data-id="${row.id}" data-available="${row.is_available}">${row.is_available?'ซ่อนประกาศ':'เปิดให้เช่า'}</button><button class="btn btn-danger" data-action="delete-listing" data-id="${row.id}">ลบ</button></div></div>`).join('')}</div>`; return;
    }
    if (tab === 'as-renter') {
      const {data,error}=await supabase.from('bookings').select('*').eq('renter_id',uid).order('created_at',{ascending:false});
      if(error) throw error;
      const rows=data||[]; const itemIds=[...new Set(rows.map(x=>x.listing_id))];
      if(!rows.length){out.innerHTML='<div class="account-empty">คุณยังไม่ได้ส่งคำขอจองสินค้า</div>';return;}
      const {data:listings,error:listingError}=await supabase.from('listings').select('id,title,price_per_day,deposit,location,image_url,owner_id,profiles!listings_owner_id_fkey(full_name)').in('id',itemIds);
      if(listingError) throw listingError;
      const listingsMap=Object.fromEntries((listings||[]).map(item=>[item.id,item]));
      const {data:reviews,error:reviewError}=await supabase.from('rental_reviews').select('booking_id').eq('reviewer_id',uid).in('booking_id',rows.map(row=>row.id));
      if(reviewError) throw reviewError;
      const reviewedBookingIds=new Set((reviews||[]).map(review=>review.booking_id));
      out.innerHTML=renderBookingRows(rows,listingsMap,'renter',{},reviewedBookingIds); return;
    }
    const {data:myListings,error:listError}=await supabase.from('listings').select('id').eq('owner_id',uid);
    if(listError) throw listError;
    const ids=(myListings||[]).map(x=>x.id);
    if(!ids.length){out.innerHTML='<div class="account-empty">เมื่อคุณลงประกาศและมีคนส่งคำขอจอง คำขอจะปรากฏที่นี่</div>';return;}
    const {data,error}=await supabase.from('bookings').select('*').in('listing_id',ids).order('created_at',{ascending:false});
    if(error) throw error;
    const rows=data||[]; const listingById={};
    const {data:ownedRows,error:ownedError}=await supabase.from('listings').select('id,title,price_per_day,deposit,location,image_url').in('id',ids);
    if(ownedError) throw ownedError;
    for(const it of ownedRows||[])listingById[it.id]=it;
    const renterIds=[...new Set(rows.map(x=>x.renter_id))]; const names={};
    if(renterIds.length){const prof=await supabase.from('profiles').select('id,full_name').in('id',renterIds);if(prof.error)throw prof.error;for(const pr of prof.data||[])names[pr.id]=pr.full_name;}
    if(!rows.length){out.innerHTML='<div class="account-empty">ยังไม่มีใครส่งคำขอจองประกาศของคุณ</div>';return;}
    out.innerHTML=renderBookingRows(rows,listingById,'owner',names);
  } catch(error) {
    out.innerHTML=`<div class="account-empty">โหลดข้อมูลไม่ได้: ${escapeHTML(friendlyError(error))}</div>`;
  }
}
function openBookingRejection(id) {
  const returnTab = accountTab;
  openModal('ปฏิเสธคำขอจอง','ระบุเหตุผลเพื่อแจ้งผู้เช่า (ไม่บังคับ)',`<form id="bookingRejectForm" data-id="${escapeHTML(id)}" data-return-tab="${escapeHTML(returnTab)}"><div class="form-field"><label for="bookingRejectReason">เหตุผลที่ปฏิเสธ</label><textarea id="bookingRejectReason" name="reason" maxlength="500" placeholder="เช่น ไม่สะดวกให้เช่าในช่วงวันที่เลือก"></textarea></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="booking-reject-cancel">กลับ</button><button type="submit" class="btn btn-danger">ยืนยันปฏิเสธ</button></div></form>`);
}
async function processBookingDecision(id,status,reason=null) {
  try {
    const {error}=await supabase.rpc('respond_to_booking',{p_booking_id:id,p_status:status,p_reason:reason});
    if(error){
      showToast('เปลี่ยนสถานะไม่ได้: '+friendlyError(error));
      if (!$('#accountContent')) openAccountDashboard(accountTab);
      return;
    }
  } catch(error) {
    showToast('เปลี่ยนสถานะไม่ได้: '+friendlyError(error));
    if (!$('#accountContent')) openAccountDashboard(accountTab);
    return;
  }
  showToast(status==='approved'?'อนุมัติการจองแล้ว':'ปฏิเสธคำขอแล้ว');
  if ($('#accountContent')) await renderAccountTab(accountTab);
  else openAccountDashboard(accountTab);
}
async function confirmBookingStep(id, step) {
  const labels = {
    owner_handover:'ยืนยันว่าคุณได้ส่งมอบสินค้าให้ผู้เช่าแล้ว',
    renter_received:'ยืนยันว่าคุณได้รับสินค้าแล้ว',
    renter_return:'ยืนยันว่าคุณได้คืนสินค้าให้เจ้าของแล้ว',
    owner_return:'ยืนยันว่าคุณได้รับสินค้าคืนแล้ว'
  };
  if (!labels[step]) return;
  openModal(labels[step], 'แนบรูปประกอบได้หากต้องการ โดยการยืนยันจะบันทึกเวลาให้ทั้งสองฝ่ายเห็น', `<form id="bookingEvidenceForm" data-id="${escapeHTML(id)}" data-step="${escapeHTML(step)}"><div class="form-field"><label for="bookingEvidenceFiles">รูปประกอบ <span class="hint">(ไม่บังคับ · สูงสุด 5 รูป รูปละไม่เกิน 5 MB)</span></label><input id="bookingEvidenceFiles" name="evidence" type="file" accept="image/jpeg,image/png,image/webp" multiple></div><p class="form-footnote">ยืนยันเฉพาะเมื่อเหตุการณ์เกิดขึ้นจริง หลักฐานที่แนบจะมองเห็นได้เฉพาะคู่สัญญาและแอดมิน</p><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="close">ยกเลิก</button><button class="btn btn-primary" type="submit">ยืนยันขั้นตอน</button></div></form>`);
}
async function submitBookingEvidence(form) {
  if (form.dataset.submitting === 'true') return;
  const id = form.dataset.id;
  const step = form.dataset.step;
  const files = Array.from(form.elements.namedItem('evidence').files || []);
  if (files.length > 5) return showToast('แนบภาพได้ไม่เกิน 5 รูปต่อขั้นตอน');
  try { files.forEach(getImageExtension); }
  catch (error) { return showToast(error.message); }
  const button = form.querySelector('button[type="submit"]');
  form.dataset.submitting = 'true';
  if (button) { button.disabled = true; button.textContent = 'กำลังบันทึก…'; }
  try {
    for (const file of files) {
      const path = await uploadRentalEvidence(file, `booking/${id}/${step}/${currentSession.user.id}/${crypto.randomUUID()}`);
      const { error } = await supabase.rpc('attach_booking_evidence', {
        p_booking_id:id, p_milestone:step, p_storage_path:path
      });
      if (error) {
        const { error:cleanupError } = await supabase.storage.from(RENTAL_EVIDENCE_BUCKET).remove([path]);
        if (cleanupError) console.warn('ลบหลักฐานการเช่าที่แนบไม่สำเร็จ', cleanupError);
        throw error;
      }
    }
    const { error } = await supabase.rpc('confirm_booking_milestone', {
      p_booking_id:id, p_action:step
    });
    if (error) throw error;
    closeModal();
    showToast(step === 'owner_return' ? 'บันทึกการรับคืนแล้ว' : 'บันทึกการยืนยันแล้ว');
    await renderAccountTab(accountTab);
  } catch (error) {
    form.dataset.submitting = 'false';
    if (button) { button.disabled = false; button.textContent = 'ยืนยันขั้นตอน'; }
    showToast('บันทึกการยืนยันไม่สำเร็จ: ' + friendlyError(error));
  }
}
async function openBookingEvidence(bookingId) {
  const { data, error } = await supabase.from('booking_evidence')
    .select('id,milestone,uploaded_by,storage_path,created_at')
    .eq('booking_id', bookingId).order('created_at', { ascending:true });
  if (error) return showToast('โหลดหลักฐานภาพไม่สำเร็จ: ' + friendlyError(error));
  if (!data?.length) {
    openModal('หลักฐานภาพการเช่า', 'ยังไม่มีรูปแนบในขั้นตอนรับหรือคืนสินค้า', '<div class="account-empty">ยังไม่มีหลักฐานภาพ</div>');
    return;
  }
  const paths = data.map(row => row.storage_path);
  const { data:signed, error:signedError } = await supabase.storage.from(RENTAL_EVIDENCE_BUCKET)
    .createSignedUrls(paths, 1800);
  if (signedError) return showToast('เปิดหลักฐานภาพไม่สำเร็จ: ' + friendlyError(signedError));
  const labels = { owner_handover:'เจ้าของส่งมอบ', renter_received:'ผู้เช่ารับสินค้า', renter_return:'ผู้เช่าแจ้งคืน', owner_return:'เจ้าของรับคืน' };
  const images = data.map((row,index) => {
    const url = signed?.[index]?.signedUrl;
    return url ? `<figure><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHTML(url)}" alt="หลักฐาน ${escapeHTML(labels[row.milestone] || row.milestone)}"></a><figcaption>${escapeHTML(labels[row.milestone] || row.milestone)} · ${escapeHTML(formatTime(row.created_at))}</figcaption></figure>` : '';
  }).join('');
  openModal('หลักฐานภาพการเช่า', 'แสดงรูปที่แนบโดยคู่สัญญาในรายการนี้', `<div class="evidence-gallery">${images}</div>`);
}
async function respondToOffer(id, status) {
  const { error } = await supabase.rpc('respond_to_wanted_offer', { p_offer_id:id, p_status:status });
  if (error) return showToast('เปลี่ยนสถานะข้อเสนอไม่สำเร็จ: ' + friendlyError(error));
  showToast(status === 'accepted' ? 'ตอบรับข้อเสนอแล้ว และปิดรับข้อเสนอเพิ่มเติม' : 'ปฏิเสธข้อเสนอแล้ว');
  await renderAccountTab('incoming-offers');
  await refreshWantedRequests();
}
async function closeWantedRequest(id) {
  const { data, error } = await supabase.from('wanted_requests')
    .update({ status:'closed' }).eq('id', id).eq('owner_id', currentSession.user.id)
    .eq('status', 'open').select('id').maybeSingle();
  if (error) return showToast('ปิดรับข้อเสนอไม่สำเร็จ: ' + friendlyError(error));
  if (!data) return showToast('ไม่พบคำขอหรือคำขอนี้ปิดไปแล้ว');
  showToast('ปิดรับข้อเสนอแล้ว');
  await renderAccountTab('my-wanted');
  await refreshWantedRequests();
}
async function logout() {
  const {error}=await supabase.auth.signOut();
  if(error) return showToast('ออกจากระบบไม่สำเร็จ: '+friendlyError(error));
  applyAuthSession(null); closeModal(); showToast('ออกจากระบบแล้ว');
}
async function manageListing(id,action,currentAvailable) {
  if(!currentSession?.user) return openAuthModal('login');
  let result;
  if(action==='delete') {
    if(!confirm('ต้องการลบประกาศนี้ใช่ไหม? การลบจะไม่สามารถย้อนกลับได้')) return;
    const check=await supabase.from('bookings').select('id',{count:'exact',head:true}).eq('listing_id',id);
    if(check.error) return showToast('ตรวจสอบประวัติการจองไม่สำเร็จ: '+friendlyError(check.error));
    if((check.count||0)>0) return showToast('รายการนี้มีประวัติการจอง จึงลบไม่ได้เพื่อเก็บประวัติไว้ คุณสามารถซ่อนประกาศแทนได้');
    const imageResult=await supabase.from('listings').select('image_path').eq('id',id).maybeSingle();
    let query=supabase.from('listings').delete().eq('id',id);
    if(!currentIsAdmin) query=query.eq('owner_id',currentSession.user.id);
    result=await query;
    if(!result.error && imageResult.data?.image_path) {
      const removed=await supabase.storage.from(LISTING_IMAGE_BUCKET).remove([imageResult.data.image_path]);
      if(removed.error) console.warn('ลบไฟล์รูปไม่สำเร็จ',removed.error);
    }
  } else {
    let query=supabase.from('listings').update({is_available:!currentAvailable}).eq('id',id);
    if(!currentIsAdmin) query=query.eq('owner_id',currentSession.user.id);
    result=await query;
  }
  if(result.error) return showToast('จัดการประกาศไม่สำเร็จ: '+friendlyError(result.error));
  await refreshListings(); await renderAccountTab(currentIsAdmin && accountTab.startsWith('admin-') ? accountTab : 'my-listings'); showToast(action==='delete'?'ลบประกาศแล้ว':currentAvailable?'ซ่อนประกาศแล้ว':'เปิดประกาศให้เช่าแล้ว');
}
async function cancelBooking(id) {
  try {
    const {error}=await supabase.rpc('cancel_booking',{p_booking_id:id});
    if(error) return showToast('ยกเลิกคำขอไม่สำเร็จ: '+friendlyError(error));
  } catch(error) {
    return showToast('ยกเลิกคำขอไม่สำเร็จ: '+friendlyError(error));
  }
  showToast('ยกเลิกคำขอจองแล้ว'); await renderAccountTab('as-renter');
}

// Event delegation for buttons created inside dialogs/cards.
document.addEventListener('click', async event => {
  const actionEl=event.target.closest('[data-action]');
  if(!actionEl) return;
  const action=actionEl.dataset.action, id=actionEl.dataset.id;
  if(action==='detail') listingDetail(id);
  else if(action==='open-listing-detail') listingDetail(id);
  else if(action==='shared-listing-detail') await openSharedListing(id);
  else if(action==='shared-request-detail') await openSharedRequest(id);
  else if(action==='listing-chat') await openConversationForListing(id);
  else if(action==='booking-chat') await openConversationForBooking(id);
  else if(action==='offer-chat') await openConversationForListing(actionEl.dataset.listingId);
  else if(action==='open-conversation') await openConversation(id);
  else if(action==='open-inbox') await openInbox();
  else if(action==='share-chat-item' && actionEl.dataset.picker) await openSharePicker();
  else if(action==='share-chat-item') await shareChatItem(actionEl.dataset.type, id);
  else if(action==='remove-chat-image') clearMessageImagePreview();
  else if(action==='open-notifications') await openNotifications();
  else if(action==='notification-link') await openNotificationTarget(id);
  else if(action==='mark-notifications-read') await markNotificationsRead();
  else if(action==='load-more-notifications') await loadMoreNotifications();
  else if(action==='offer-request') await openOfferForm(id);
  else if(action==='offer-accept') await respondToOffer(id,'accepted');
  else if(action==='offer-decline') await respondToOffer(id,'declined');
  else if(action==='close-wanted') await closeWantedRequest(id);
  else if(action==='edit-listing') openListingForm(id);
  else if(action==='map-view') setListingsView(true);
  else if(action==='list-view') setListingsView(false);
  else if(action==='favorite'){event.stopPropagation();toggleFavorite(id);}
  else if(action==='book') openBooking(id);
  else if(action==='request') openRequestForm();
  else if(action==='close') closeModal();
  else if(action==='back-detail') listingDetail(id);
  else if(action==='open-listing') openListingForm();
  else if(action==='auth-mode-login') openAuthModal('login');
  else if(action==='auth-mode-signup') openAuthModal('signup');
  else if(action==='open-account') openAccountDashboard();
  else if(action==='logout') await logout();
  else if(action==='account-tab') await renderAccountTab(actionEl.dataset.tab);
  else if(action==='booking-approve') await processBookingDecision(id,'approved');
  else if(action==='booking-reject') openBookingRejection(id);
  else if(action==='booking-reject-cancel') { closeModal(); openAccountDashboard(accountTab); }
  else if(action==='confirm-booking-step') await confirmBookingStep(id,actionEl.dataset.step);
  else if(action==='booking-evidence') await openBookingEvidence(id);
  else if(action==='submit-payment') await openPaymentSubmission(id,actionEl.dataset.type);
  else if(action==='payment-proof') await openPaymentProof(id);
  else if(action==='payment-review') openPaymentReview(id,actionEl.dataset.status);
  else if(action==='payment-refund') openDepositRefund(id);
  else if(action==='owner-payout') openOwnerPayout(id);
  else if(action==='locate-address') await locateAddressOnMap(true);
  else if(action==='booking-route') await openRouteModal(id, actionEl.dataset.kind);
  else if(action==='edit-meeting-points') await openMeetingPointsEditor(id);
  else if(action==='route-from-me') await routeFromMyLocation();
  else if(action==='pin-clear') { const kind=$(`input[name="${actionEl.dataset.prefix}PinKind"]:checked`)?.value||'pickup'; activeModalMap?.clear?.(kind); }
  else if(action==='pin-my-location') { const kind=$(`input[name="${actionEl.dataset.prefix}PinKind"]:checked`)?.value||'pickup'; try { await activeModalMap?.useMyLocation?.(kind); } catch(error) { showToast(error.message||'ระบุตำแหน่งไม่สำเร็จ'); } }
  else if(action==='clear-promptpay') await savePromptPaySettings(null,true);
  else if(action==='clear-payment-instructions') await savePaymentInstructions(null,'');
  else if(action==='review-booking') openReviewForm(id,actionEl.dataset.listingId);
  else if(action==='report-booking') openReportForm({bookingId:id,listingId:actionEl.dataset.listingId,reportedUserId:actionEl.dataset.reportedUserId});
  else if(action==='report-listing') openReportForm({listingId:id,reportedUserId:actionEl.dataset.ownerId});
  else if(action==='report-review') openReportForm({reviewId:id});
  else if(action==='admin-report') {
    const {data,error}=await supabase.from('issue_reports').select('*').eq('id',id).maybeSingle();
    if(error) showToast('โหลดรายงานไม่สำเร็จ: '+friendlyError(error));
    else if(!data) showToast('ไม่พบรายงานนี้');
    else {
      if(data.review_id) {
        const {data:review,error:reviewError}=await supabase.from('rental_reviews').select('is_hidden').eq('id',data.review_id).maybeSingle();
        if(reviewError) return showToast('โหลดสถานะรีวิวไม่สำเร็จ: '+friendlyError(reviewError));
        data.review_hidden=Boolean(review?.is_hidden);
      }
      openAdminReportUpdate(data);
    }
  }
  else if(action==='cancel-booking') await cancelBooking(id);
  else if(action==='toggle-listing') await manageListing(id,'toggle',actionEl.dataset.available==='true');
  else if(action==='delete-listing') await manageListing(id,'delete',false);
});
document.addEventListener('submit',event=>{
  if(event.target.id==='searchForm'){event.preventDefault();searchTerm=$('#searchInput').value.trim();activeCategory=$('#categorySelect').value;budgetMax=$('#budgetSelect').value;renderListings();$('#explore').scrollIntoView({behavior:'smooth'});}
  if(event.target.id==='requestForm'){event.preventDefault();handleRequestSubmit(event.target);}
  if(event.target.id==='listingForm'){event.preventDefault();handleListingSubmit(event.target);}
  if(event.target.id==='bookingForm'){event.preventDefault();handleBookingSubmit(event.target);}
  if(event.target.id==='bookingRejectForm'){
    event.preventDefault();
    const form=event.target;
    const id=form.dataset.id;
    const reason=String(new FormData(form).get('reason')||'').trim()||null;
    accountTab=form.dataset.returnTab||accountTab;
    closeModal();
    processBookingDecision(id,'rejected',reason);
  }
  if(event.target.id==='issueReportForm'){event.preventDefault();submitIssueReport(event.target);}
  if(event.target.id==='profileSettingsForm'){event.preventDefault();saveProfileSettings(event.target);}
  if(event.target.id==='bookingEvidenceForm'){event.preventDefault();submitBookingEvidence(event.target);}
  if(event.target.id==='rentalReviewForm'){event.preventDefault();submitRentalReview(event.target);}
  if(event.target.id==='adminReportForm'){event.preventDefault();updateAdminReport(event.target);}
  if(event.target.id==='paymentProofForm'){event.preventDefault();submitPaymentProof(event.target);}
  if(event.target.id==='paymentReviewForm'){event.preventDefault();reviewPayment(event.target);}
  if(event.target.id==='depositRefundForm'){event.preventDefault();recordDepositRefund(event.target);}
  if(event.target.id==='paymentSettingsForm'){event.preventDefault();savePaymentInstructions(event.target);}
  if(event.target.id==='promptpaySettingsForm'){event.preventDefault();savePromptPaySettings(event.target);}
  if(event.target.id==='platformFeeForm'){event.preventDefault();savePlatformFee(event.target);}
  if(event.target.id==='ownerPayoutForm'){event.preventDefault();recordOwnerPayout(event.target);}
  if(event.target.id==='meetingPointsForm'){event.preventDefault();submitMeetingPoints(event.target);}
  if(event.target.id==='adminPaymentFilterForm'){event.preventDefault();filterAdminPayments(event.target);}
  if(event.target.id==='authForm'){event.preventDefault();handleAuthSubmit(event.target);}
  if(event.target.id==='offerForm'){event.preventDefault();handleOfferSubmit(event.target);}
  if(event.target.id==='messageForm'){event.preventDefault();sendMessage(event.target);}
});
$('#filterRow').addEventListener('click',e=>{const btn=e.target.closest('[data-category]');if(!btn)return;activeCategory=btn.dataset.category;renderListings();});
$('#categoryGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-category]');if(!btn)return;activeCategory=btn.dataset.category;$('#categorySelect').value=activeCategory;renderListings();$('#explore').scrollIntoView({behavior:'smooth'});});
$('#sortSelect').addEventListener('change',e=>{sortMode=e.target.value;renderListings();});
$('#listViewButton').addEventListener('click',()=>setListingsView(false));
$('#mapViewButton').addEventListener('click',()=>setListingsView(true));
$('#closeModal').addEventListener('click',closeModal);
$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
['#openRequestTop','#openRequestHero','#openRequestMain','#openRequestMobile'].forEach(sel=>$(sel)?.addEventListener('click',openRequestForm));
['#openListingTop','#openListingMobile'].forEach(sel=>$(sel)?.addEventListener('click',()=>openListingForm()));
$('#openAuthTop')?.addEventListener('click',()=>openAuthModal('login'));
$('#openAccountTop')?.addEventListener('click',()=>openAccountDashboard('profile'));
$('#closeChatDock')?.addEventListener('click',closeChatDock);
$('#messageImage')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  const preview = $('#messageImagePreview');
  clearMessageImagePreview(false);
  if (!file) {
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
    event.target.value = '';
    showToast('เลือกรูป JPG, PNG, WebP หรือ GIF ขนาดไม่เกิน 5 MB');
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  $('#clearMessageImage').hidden = false;
});
$('#messageForm textarea')?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
});
$('#mobileMenu').addEventListener('click',()=>{
  const accountActions = currentSession?.user
    ? `<button class="btn btn-secondary" data-action="open-account">${currentIsAdmin?'แผงควบคุมแอดมิน':'บัญชีของฉัน'}</button><button class="btn btn-secondary" data-action="open-inbox">ข้อความ</button><button class="btn btn-secondary" data-action="open-notifications">การแจ้งเตือน <span class="notification-count" data-mobile-notification-count>0</span></button><button class="btn btn-danger" data-action="logout">ออกจากระบบ</button>`
    : `<button class="btn btn-secondary" data-action="auth-mode-login">เข้าสู่ระบบ / สมัครสมาชิก</button>`;
  openModal('เมนู','เลือกส่วนที่ต้องการไป',`<div style="display:grid;gap:10px">${accountActions}<button class="btn btn-secondary" data-action="open-listing">ลงประกาศ</button><a class="btn btn-secondary" href="#explore" data-action="close">ค้นหาของ</a><a class="btn btn-secondary" href="#demand" data-action="close">แจ้งสิ่งที่ต้องการ</a><a class="btn btn-secondary" href="#how" data-action="close">วิธีใช้งาน</a><button class="btn btn-primary" data-action="close">ปิดเมนู</button></div>`);
});
$('#mobileMenu').addEventListener('click',()=>{
  const badge = $('#modalContent [data-mobile-notification-count]');
  if (badge) {
    const count = Number($('#notificationCount')?.dataset.unread || 0);
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
});

async function initialize() {
  setConnectionNotice();
  if (!liveMode) {
    getListings(); renderListings(); updateAuthButtons(); await refreshWantedRequests(); return;
  }
  if (!authSubscription) {
    const result = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthSession(session);
    });
    authSubscription = result.data.subscription;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('อ่าน session ไม่สำเร็จ', error);
    showToast('กู้คืนสถานะเข้าสู่ระบบไม่สำเร็จ: ' + friendlyError(error));
  }
  applyAuthSession(data?.session || null);
  await refreshListings();
  await refreshWantedRequests();
}

function applyAuthSession(session) {
  const previousUserId = currentSession?.user?.id || null;
  const nextUserId = session?.user?.id || null;
  currentSession = session || null;
  const generation = ++authGeneration;
  if (previousUserId !== nextUserId) {
    currentProfile = null;
    currentIsAdmin = false;
  }
  updateAuthButtons();
  if (!nextUserId) {
    currentProfile = null;
    currentIsAdmin = false;
    notificationCache = [];
    stopRealtime();
    updateAuthButtons();
    if ($('#modalBackdrop')?.classList.contains('open')) closeModal();
    return;
  }
  setTimeout(async () => {
    if (generation !== authGeneration || currentSession?.user?.id !== nextUserId) return;
    await loadCurrentProfile(nextUserId);
    if (generation !== authGeneration || currentSession?.user?.id !== nextUserId) return;
    startRealtime(nextUserId);
    await importLegacyWantedRequests(nextUserId);
    if (generation !== authGeneration || currentSession?.user?.id !== nextUserId) return;
    await Promise.all([refreshListings(), refreshWantedRequests()]);
  }, 0);
}
initialize();
