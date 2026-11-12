# SURA CHAT — A–Z Voice Room App & Admin Design Blueprint

**অবস্থা:** ডিজাইন প্রস্তাব ও ভিজ্যুয়াল মকআপ; কার্যকর অ্যাপ, লাইভ সার্ভার বা প্রকাশিত APK নয়। ১১ নভেম্বর ২০২৬।  
**ব্র্যান্ড:** SURA CHAT — Sharika থেকে আলাদা পরিচয় ও আলাদা অ্যাপ/ডেটা।

## ১. ডিজাইন সিস্টেম

- Style: Royal Premium Clean 3D; Midnight Navy `#101329`, Royal Purple `#31204B`, Champagne Gold `#E9BE68`, Turquoise `#2FD6D1`, অফ-হোয়াইট টেক্সট।
- ৪টি UI নিয়ম: কম ভিজ্যুয়াল ভিড়, বড় ট্যাপ টার্গেট, সর্বত্র একই আইকন/টেক্সট, অ্যানিমেশনের সময় পারফরম্যান্স ও Accessibility।
- স্ক্রিনে 3D গ্লো/গোল্ড শুধু গুরুত্বপূর্ণ CTA, VIP ও গিফটে; সাধারণ নেভিগেশন শান্ত ও পরিষ্কার।
- লোগো S + মাইক্রোফোন + সাউন্ডওয়েভ; Splash একবার, এরপর সরাসরি হোম।
- নিচের ৫ ট্যাব: **Home · Rooms · Create/Live · Messages · Me**। র‍্যাঙ্কিং ও স্টোর হোম/প্রোফাইলের শর্টকাট।

## ২. সম্পূর্ণ ইউজার স্ক্রিন তালিকা

| বিভাগ | স্ক্রিন | মূল কাজ |
|---|---|---|
| প্রবেশ | Splash, Welcome, Sign in, Sign up, Forgot Password | Google বা email/password; পাসওয়ার্ড রিসেট ও সেশন সিকিউরিটি |
| হোম | Discover/Home, Banner/Event, Notifications | Popular / New / My / History, দেশের রুম প্রথমে, Country/Global filter, pinned rooms |
| রুম তালিকা | Search Rooms, My Rooms, Room History, Create Room | ১ ট্যাপে সরাসরি join, দেশ/ভাষা ফিল্টার, room card |
| প্রোফাইল | Main Profile, Edit Profile, Other User Profile | Avatar, ID, nickname, bio, badges, levels, edit-pencil, follow |
| সোশ্যাল | Followers, Following, Friends, Private Chat, Invitations | DM, follow, blacklist, block, report, invite, CP/Friendship |
| রুম | Room Main, Seat Picker, In-room User Popup | Mic seats, live audio, messages, gift, games, role actions |
| রুম পরিচালনা | Room Profile, Room Settings, Theme Gallery, Admins, Blocked Users | Cover, title, announcement, lock, seat-count, moderation |
| উপহার | Gift Shop, Gift Preview, Send Gift, Gift History | 10K/100K/1M/2M/5M ও custom price tiers, luxury video effect |
| প্রোফাইল শপ | VIP Center, Store, My Bag, My Items | Frames, animated entry, medals, noble/SBF, tags, validity |
| অর্থনীতি | Wallet Hub, Recharge, Exchange, Transactions | Main wallet, salary wallet, verified seller wallet আলাদা |
| সেলার | Seller List, Seller Details, Seller Transfer, Seller Ledger | অনুমোদিত seller, প্রাপ্যতা, ট্রান্সফার ও হিসাব |
| আয় | BD Center, Agency Center, Host Center | Apply, Join, target, members, salary statement, ranking |
| গেম/র‍্যাঙ্কিং | Games, Daily/Weekly/Monthly Ranking, Winners, Rewards | রুমে অডিও বন্ধ না করে গেম, পুরস্কার ইতিহাস |
| অতিরিক্ত | Daily Tasks, Lucky Box, Notice Center, Help, Settings | Tasks reset, claim, permissions, language, data/privacy, support |

## ৩. মূল প্রোফাইল বনাম এডিট প্রোফাইল

**Main Profile:** উপরে প্রোফাইল ফটো + সক্রিয় ফ্রেম, nickname, public/special ID, আলাদা rich ও user level, country flag, bio, tags। মাঝখানে Followers/Following, VIP, Bag, Store, Wallet, Seller List, Agency/BD/Host, Ranking, Task Center। নিচে Settings, Block List, Help।

**Edit Profile:** pencil এ ট্যাপ করলে আলাদা পেজে নাম, avatar, bio, gender, manual country, birthday, cover photo ও privacy settings। Save দিলে হোম, রুমের সিট, room popup ও র‍্যাঙ্কিংয়ে একই আপডেট দেখাবে। Real/internal ID পাবলিক প্রোফাইলে দেখানোর দরকার নেই, special ID আলাদা ইউনিক।

**In-room User Popup:** avatar+frame, user ID, nickname, badges/role/level, follow, private chat, gift, invite, view profile; owner/admin-এর জন্য শর্তসাপেক্ষে mute/kick/block। নিজের জন্য edit বা seat leave; সাধারণ ইউজার অন্যকে kick করতে পারবে না।

## ৪. রুম প্রধান স্ক্রিন

- Header: ছোট চওড়া room cover/profile, room name, country, online count, room ID, Follow ও More। আলাদা ভারী profile page লোড হবে না।
- Seats: 9/12/16 configurable; কোনো owner-only seat নয়। Owner/admin/user নিজে seat tap না করলে বসবে না বা mic চালু হবে না।
- Owner/admin: শর্ত অনুযায়ী seat lock/unlock, mic mute, invite, kick, block, assign admin; room lock ও announcement।
- Announcement: message panel-এর শীর্ষে pinned, নতুন joiner-ও পড়বে; পুরোনো সাধারণ chat messages নতুন joiner দেখবে না।
- Message pane: seats-কে সরাবে না; overlay বা fixed panel; join notification, emoji, gift notices, live chat।
- Footer: chat, mic (seat পর), gifts, games, music/voice effects, more। Video gift একবারে একটিই render হবে; audio continue while game/gift runs।
- Presence: leave করলে server-side seat/presence সরবে; reconnection/heartbeat এবং mic-permission recovery। Room theme বদলালে user avatar/profile বদলাবে না।

## ৫. Room Profile এবং Management

Room Profile-তে room cover, title, owner, online, followers, description, announcement ও member list। Owner-এর Room Management-এ change cover, name, theme, room lock, announcement, seat count, seat restrictions, admin invite/revoke, banned list, background music, room reports।

| কাজ | Owner | Delegated Room Admin | সাধারণ সদস্য |
|---|---|---|---|
| রুমের নাম/থিম/সিটসংখ্যা | হ্যাঁ | না (বিশেষ অনুমতি ছাড়া) | না |
| Lock room ও admin নিয়োগ | হ্যাঁ | না | না |
| সিট lock/unlock, mute, kick, invite | হ্যাঁ | হ্যাঁ (অনুমতি অনুযায়ী) | না |
| সিট নির্বাচন, chat, gift, report | হ্যাঁ | হ্যাঁ | হ্যাঁ |

## ৬. গিফট, VIP, ব্যাগ, noble

- Gift Shop categories: Popular, Love, Luxury, CP, Friendship, Special, New। প্রতিটি gift-এর আলাদা price ও effect, admin-editable। ১M/২M/৫M/১০M এমন বিভিন্ন high-tier দাম, সব gift এক দামে নয়।
- Luxury video effect: high-quality MP4/WebM + sound, dark backdrop ছাড়া center-to-full-screen reveal; একই সময়ে একটি player, queue এবং skip, voice-audio ducking সীমিত।
- VIP levels: আলাদা privilege/validity, preview, purchase, expiry; premium frame, entry, noble/medal, badge/ID styling।
- **Medal** (অর্জনের পদক) ও **Noble/SBF** (অন্য স্ট্যাটাস লাইন) আলাদা category।
- My Bag: Owned, Active, Expired; frame, entry, VIP, tag, noble assign/remove/renew; সাধারণভাবে ৩০ দিনের মেয়াদ (admin config)।
- CP relationship requires configured qualifying gift; friendship many-to-many, private settings and consent।

## ৭. কয়েন ও আয় — তিন ধরনের ওয়ালেট

| Wallet | কোন টাকা/ইউনিট | কী করা যাবে | কী যাবে না |
|---|---|---|---|
| Main Wallet | Purchased/app coins | Recharge, gift send, authorized exchange, purchase, ledger | সাধারণ ব্যবহারকারী থেকে আরেক ব্যবহারকারীকে সরাসরি transfer নয় |
| Salary Wallet | Matured Host/Agency/BD earnings | পূর্ণ statement, approved seller-এ transfer, defined rate-এ main coin conversion | নিয়মের বাইরে arbitrary withdraw/transfer নয় |
| Seller Wallet | Approved coin seller balance | Seller recharge/salary settlement, double-entry ledger, admin reconciliation | Unapproved user-কে seller control নয় |

- Main → Salary ওয়ালেট স্বয়ংক্রিয়/ইচ্ছামতো move করা যাবে না। স্যালারি maturity, rate, limits, verification ও fees server-configurable।
- Gift sale revenue/room reward distribution server-side immutable transaction IDs দিয়ে হিসাব হবে। Double-charge, repeated request ও negative balance আটকানো হবে।
- Sharika-তে আলোচিত উদাহরণ: Host 40%, Agency 10%, BD 5%, system 45%; room reward 10%; invite 100K; exchange 30%; USD rate 1 USD = 500K coins। **এগুলো SURA CHAT-এ final configuration নয়**; নতুন অ্যাপের জন্য আলাদা অনুমোদন ও revenue consistency দরকার।
- Seller List-এ Approved/Active status, ID, country, contact method, available status, transaction history; ব্যক্তিগত সংবেদনশীল ডেটা প্রকাশ নয়।
- Real-money cashout/commission model চালু করার আগে প্রাসঙ্গিক আইন, tax, payment-provider rules ও app-store policies যাচাই বাধ্যতামূলক।

## ৮. BD/Agency/Host Center

- BD Center: BD eligibility, assigned agencies, host earnings summary, target, ledger, BD ranking।
- Agency Center: create/join agency, invite/manage hosts, agency owner ID, host count, target progress, agency earnings।
- Host Center: application/approval, agency membership, daily gifts/targets, pending vs matured salary, transaction statement।
- Admin sets targets centrally; user app, salary calculation, ranking ও reports-এ এক config version ব্যবহার হবে। BD removal future BD income বন্ধ করবে, past ledgers মুছবে না।

## ৯. Ranking / Events / Daily Tasks

- Rankings: Top gifters, received gifts, rooms, CP, Agency, BD, daily/weekly/monthly। Top 3 podium and next ranked list।
- Weekly winners: completed weeks snapshot, rewards preview, prize distribution state, recipients and history; exact server cutoff/timezone।
- Events: per-country/global banners, event countdown, participation CTA, winners ticker, gift win popup, room entry notification।
- Tasks: 24h refresh and history; Lucky Box server-random limits, prize odds disclosure where applicable।

## ১০. অ্যাডমিন প্যানেল — পূর্ণ মেনু

1. Dashboard: DAU, current live rooms, voice quality failures, coin transactions, revenue summary, pending approvals, abuse alerts।
2. User Management: ID/email/phone search, profile, signup method, flags, roles, levels, block/unblock, reset session, moderation notes।
3. Room Management: live/closed rooms, owner, country, lock status, seat limits, ban/mute logs, room cover/theme, reports।
4. Wallet & Coins: recharge, authorized add/subtract, reason, before/after balance, actor, transaction ID, ledger/export।
5. Sellers: applications, approve/suspend, wallet funding, seller list visibility, reconciliation, abnormal balance flags।
6. Gifts & Store: video/media upload, sound, thumbnail, category, price, preview, on/off, validity, grant/revoke items।
7. VIP/Medal/Noble/ID: tiers, badge, SBF/noble, frames, animated entry, unique special ID assign/revoke/expiry।
8. BD/Agency/Host: assign/remove, member lists, targets, salary rates, commissions, maturity, transfers, ledgers।
9. Rankings & Rewards: schedules, top users, prize definitions, preview distribution, finalize, history, reversals।
10. Events & Banners: country/global targeting, creative upload, rotate, schedule, push notices, opening banner on/off।
11. Support & Moderation: reports, tickets, decisions, appeals, content rules, block lists, evidence retention।
12. Settings: rates, thresholds, locales, feature flags, theme catalog, room reward, voice defaults, play billing product mapping।
13. Analytics & QA: crash-free sessions, voice join latency, mic success rate, gift completion, daily monitoring।
14. Audit Log & Export: immutable actions, approval history, actor, IP/session, before/after, Google Sheets/CSV export।

### Admin permission model

| Role | অনুমতি |
|---|---|
| Super Admin | সব config, roles, risk controls, sensitive decisions; MFA and high-risk dual approval |
| Admin | users/rooms/gifts/events operations; restricted coin limits |
| Assistant/Moderator | report handling, mute/ban under policy; no currency editing |
| Finance/Wallet Manager | approved coin/seller/salary ledger operations; separate audit & confirmation |
| Agency/BD Manager | agency/host applications, targets within delegated scope; no master financial settings |

**নিরাপত্তা:** সব Admin action server-verified RBAC; MFA; audit trails; large coin adjustment approval; idempotency, reversals as new ledger transactions, not silent overwrite।

## ১১. Backend architecture ও app quality

- Android Java/Kotlin native UI or a deliberately chosen framework, Cloudflare Workers API + D1 database, R2 media storage, and a dedicated WebRTC/RTC voice service। Worker API-ই live audio media transport নয়।
- Separate staging/prod environments; login/session, avatar uploads, media CDN, seat presence, chat, gift transactions, wallet ledger, admin roles/config and analytics।
- UX targets: room card tap → direct room entry, mic opening only after seat select + permission, smooth 60fps where device allows, sane fallback on slow networks, no audio drop when screen changes।
- Tests: two real devices for voice, permission-denied state, background audio, reconnection, profile sync inside/outside rooms, old messages, stale seats, wallet double-spend and admin permissions।
- Languages: Bengali, English, Arabic as phased support; manual country, accessible text and high contrast, no mandatory GPS।

## ১২. Google Play ও safety considerations

- App-bought digital coins / VIP / gifts should use Google Play Billing when applicable under Google Play payments policy; never promise that an external seller bypass is accepted।
- In-app virtual currency must be handled according to Play policies, including app-specific use. Rewards with randomized purchased items require upfront odds disclosure where applicable।
- Social voice/chat apps need user reporting/blocking, objectionable content rules, moderation and appeals. Real-money wagering/gambling-like games demand separate review; this blueprint **does not include real-money gambling or cashout implementation**।
- Official references: https://support.google.com/googleplay/android-developer/answer/9858738 ; https://support.google.com/googleplay/android-developer/answer/9876937 ; https://support.google.com/googleplay/android-developer/answer/9877032

## ১৩. বাস্তবায়ন ও ডেলিভারির ধাপ

1. **Design approval:** splash, home, main/edit profile, room, popup, owner settings, shop, wallet, agency, VIP, ranking, admin panel; layout and naming approval।
2. **MVP functional:** secure auth, profile, room create/join, seats, RTC voice, chat, report/block, core gifts, ledger, admin RBAC।
3. **Economy & management:** Play Billing, 3-wallet model, salary maturity, seller approval, BD/Agency/Host, ranking and rewards।
4. **Premium media:** 3D gifts, frame, entry, Noble, theme catalog, event automation, notifications and localization।
5. **QA & release:** staging tests, security and Play policy review, closed testing, signed AAB, Play Console rollout।

## ১৪. বাকি সিদ্ধান্তগুলো

**নতুন SURA CHAT-এ Sharika-এর অর্থনীতির নিয়মগুলো হুবহু নেবে কি না**, coin bundles, invite reward, gift salary commission, seller transfers, cashout availability, verified login and role permissions — এগুলো code/config করার আগে স্থির করতে হবে।

*চিত্রগুলোর নাম, লোকসংখ্যা, তারিখ ও কয়েন ব্যালেন্স সম্পূর্ণ উদাহরণ; লাইভ ডেটা নয়। ডিজাইন মকআপ সফটওয়্যার বাস্তবায়ন বা স্টোরে প্রকাশের প্রমাণ নয়।*