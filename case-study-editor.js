/* =============================================================================
   Case Study Editor — Notion/Framer-style in-place editor for project-1.html
   -----------------------------------------------------------------------------
   - View mode: page renders exactly like a published case study.
   - Edit mode: every text node is contenteditable, every media slot accepts
     drag-and-drop, every block has a hover toolbar (drag handle, change
     layout/style, delete), and there's a "+" inserter between blocks and
     between sections to add new content.
   - Storage: localStorage draft (auto-saved on every change).
   - Publish: downloads a JSON snapshot you can commit to the repo, and also
     copies the same JSON into the "published" slot (rendered when ?mode=view
     or when the Publish button is the last action).
   - Import: load a JSON file to replace the current draft.

   The data model intentionally matches what the previous sync script used so
   any existing default content keeps rendering. Adding new block types is a
   matter of (a) adding a renderer, (b) declaring it in BLOCK_REGISTRY, and
   (c) optionally adding inline controls in the block toolbar.
   ============================================================================= */

(() => {
    'use strict';

    const CASE_ID = document.documentElement.dataset.caseStudyId;
    if (!CASE_ID) return;

    // Bumped Zapp to v3 so the new Figma-authored case-study content
    // is not masked by an older browser draft in localStorage.
    const CONTENT_VERSION = CASE_ID === 'growth-experiments'
        ? 'v5'
        : (CASE_ID === 'zapp-account' ? 'v4' : (CASE_ID === 'now-and-me' ? 'v4' : (CASE_ID === 'project-3' ? 'v3' : 'v2')));
    const INDEXED_CASE_STUDIES = new Set(['zapp-account', 'growth-experiments', 'project-3', 'now-and-me']);
    const STORAGE_KEY = `cs-editor-draft:${CONTENT_VERSION}:${CASE_ID}`;
    const PUBLISHED_KEY = `cs-editor-published:${CONTENT_VERSION}:${CASE_ID}`;
    const BUNDLED_CONTENT_PATHS = {
        'zapp-account': 'content/case-study-zapp-account.json',
        'growth-experiments': 'content/case-study-growth-experiments.json',
        'now-and-me': 'content/case-study-now-and-me.json'
    };
    const ASSET_DB_NAME = 'cs-editor-assets';
    const ASSET_DB_VERSION = 1;
    const ASSET_REF_PREFIX = 'cs-asset:';
    const LOCAL_ASSET_OVERRIDES = {
        'cs-asset:zapp-account:1781856232078:b6kfqytkq': 'asset/case-studies/zapp-account/b2n56t1hj-zapp-account-b2n56t1hj.png',
        'cs-asset:zapp-account:1781856232145:b9y94ch6q': 'asset/case-studies/zapp-account/bro1bdd73-zapp-account-bro1bdd73.png',
        'cs-asset:zapp-account:1781960639879:be21i6quu': 'asset/case-studies/zapp-account/bbwcmexhv-image.png',
        'cs-asset:zapp-account:1781960650114:b7g1yobdm': 'asset/case-studies/zapp-account/bkw4g7p6d-image.png',
        'cs-asset:zapp-account:1781856232150:bc8yjynts': 'asset/case-studies/zapp-account/busact944-zapp-account-busact944.png',
        'cs-asset:zapp-account:1781979790777:bshl8ycca': 'asset/case-studies/zapp-account/bsy7x35a2-screen-recording-jun-20-2026-from-kommodo.gif',
        'cs-asset:zapp-account:1781856244196:bl0lzy1g3': 'asset/case-studies/zapp-account/b3o4grj75-screenrecording2026-06-19at12-48-40pm-ezgif-com-crop-1.gif',
        'cs-asset:zapp-account:1781857889963:b375vscv0': 'asset/case-studies/zapp-account/b5591rluy-image.png',
        'cs-asset:growth-experiments:1781886666080:bi5uwrly0': 'asset/water.png'
    };
    const ZAPP_LOCAL_MEDIA_PATCHES = [
        {
            path: ['process', 4, 'media'],
            src: 'cs-asset:zapp-account:1781856232078:b6kfqytkq',
            mimeType: 'image/png'
        },
        {
            path: ['process', 5, 'media'],
            src: 'cs-asset:zapp-account:1781856232145:b9y94ch6q',
            mimeType: 'image/png'
        },
        {
            path: ['process', 11],
            src: 'cs-asset:zapp-account:1781856232150:bc8yjynts',
            mimeType: 'image/png'
        },
        {
            path: ['design', 3],
            src: 'cs-asset:zapp-account:1781856232150:bc8yjynts',
            mimeType: 'image/png'
        },
        {
            path: ['design', 6, 'media'],
            src: 'cs-asset:zapp-account:1781856244196:bl0lzy1g3',
            mimeType: 'image/gif'
        }
    ];
    const assetUrlCache = new Map();
    const SECTION_ID_MAP = {
        overview: 'cs-overview',
        problem: 'cs-problem',
        process: 'cs-process',
        design: 'cs-design',
        deferred: 'cs-deferred',
        impact: 'cs-impact',
        reflection: 'cs-reflection'
    };

    /* ---------------------------------------------------------------------------
       DEFAULT CONTENT
       --------------------------------------------------------------------------- */
    /* Meta row schema: ordered cells displayed under the title.
       Each cell = { key, label, value } — fully editable in edit mode. */
    function defaultMeta() {
        return [
            { key: 'role',     label: 'Role',     value: 'Product Designer' },
            { key: 'timeline', label: 'Timeline', value: '' },
            { key: 'team',     label: 'Team',     value: '' },
            { key: 'platform', label: 'Platform', value: '' }
        ];
    }

    function blankDoc(id, title) {
        return {
            id,
            title,
            subtitle: '',
            meta: defaultMeta(),
            hero: { type: 'image', src: '', alt: '' },
            sections: [
                { id: 'impact',  label: 'Impact',  blocks: [
                    { type: 'impact', headline: 'Headline outcome', body: 'Short supporting line that grounds the outcome.' }
                ] },
                { id: 'context', label: 'Project context', blocks: [
                    { type: 'text', body: 'Write the project context here.' }
                ] }
            ]
        };
    }

    const DEFAULT_DOCS = {
        'zapp-account': {
            id: 'zapp-account',
            title: 'Zapp Account: Building it right from the start',
            subtitle: 'Rebranding & rebuilding the a product from scratch. New name, new design system, new codebase, and a fundamentally different way for users to get access to it.',
            meta: [
                { key: 'timeline', label: 'Timeline', value: '2023–24' },
                { key: 'platform', label: 'Platform', value: 'iOS, Android' },
                { key: 'role',     label: 'Role',     value: 'UX Designer II' },
                { key: 'team',     label: 'Team',     value: '2 UX Designer, 2 Product Manager, 4 Developer' }
            ],
            hero: { type: 'image', src: '', alt: 'Zapp Account hero' },
            sections: [
                { id: 'overview', label: 'Overview', blocks: [
                    { type: 'meta' },
                    { type: 'section-label', label: 'Overview' },
                    { type: 'text', body: 'We were given a rare brief — take a product that millions of people use, throw out everything, and start over.\nNew name, new code, new design. No legacy constraints.' },
                    { type: 'text', body: 'Zapp Account is HDFC Bank\'s reimagined digital wallet — rebuilt from scratch in partnership with Zeta.\nNew name, new identity, new codebase in Flutter, and a fundamentally different model for how users could get access to it. What made this different from a rebrand: the product had a structural limitation that no amount of visual redesign could fix. We had to solve that first.' },
                    { type: 'metrics', items: [
                        { stat: 'X%', label: 'Growth in User adoption post launch', note: '' },
                        { stat: 'X Million+', label: 'Monthly active users reached within 6 months', note: '' },
                        { stat: 'X%', label: 'Growth in User adoption post launch', note: '' }
                    ] }
                ] },
                { id: 'problem', label: 'Problem', blocks: [
                    { type: 'section-label', label: 'Problem' },
                    { type: 'text', body: 'PayZapp has had a digital wallet for quite some time, but it hasn\'t effectively attracted new users. Despite having UPI functionality, many users remain unaware of it and aren\'t engaging with the product as we hoped. To address this, we need to clarify our user acquisition strategy and boost both active usage and new sign-ups. It\'s essential to define the value proposition we want to communicate to potential users.' },
                    { type: 'text', body: 'To address this challenge, we should broaden our approach by refining our user acquisition strategy and boosting both active engagement and new registrations. Since this is an HDFC Bank product, it\'s important to highlight the core value they offer, as they are sponsoring this significant transformation to attract a wider audience.' }
                ] },
                { id: 'process', label: 'Process', blocks: [
                    { type: 'section-label', label: 'Process' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'The Old Scenario' },
                    { type: 'text', body: 'PayZapp has had a digital wallet for quite some time, but it hasn\'t effectively attracted new users. Despite having UPI functionality, many users remain unaware of it and aren\'t engaging with the product as we hoped. To address this, we need to clarify our user acquisition strategy and boost both active usage and new sign-ups. It\'s essential to define the value proposition we want to communicate to potential users.' },
                    { type: 'text', body: 'PayZapp Wallet had already introduced UPI — about four to five months before the rebrand initiative began. The feature was live, it was working, and it had moved some metrics. But there was a problem: almost nobody knew about it.\nNo meaningful UI change had been made to reflect this addition. No communication had gone out to nudge existing users. The product had quietly gained a significant capability and then said nothing about it. As a result, active usage stayed low — not because the feature didn\'t work, but because the product didn\'t tell its own story.' },
                    { type: 'horizontal', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'horizontal', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'text', body: 'This set the starting point for the rebrand. Before designing anything new, I needed to understand what the data was actually saying — who was using the product, where they were dropping off, and what they were ignoring.' },
                    { type: 'metrics', items: [
                        { stat: 'X%', label: 'Growth in User adoption post launch', note: '' },
                        { stat: 'X Million+', label: 'Monthly active users reached within 6 months', note: '' },
                        { stat: 'X%', label: 'Growth in User adoption post launch', note: '' }
                    ] },
                    { type: 'text', body: 'The goal wasn\'t just to ship a new visual language. It was to design a product that could speak to both the users already in the ecosystem and the new ones we needed to acquire — and make sure neither group felt like the product wasn\'t built for them.\nThat meant the first question wasn\'t a design question. It was: who is this product actually for?' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'The Proposed Direction' },
                    { type: 'text', body: 'The brief from the bank was clear: relaunch with a new identity, new name, and a stronger reason for users to come back. But the real challenge wasn\'t the rebrand — it was adoption. How do you re-introduce a product to people who\'ve already dismissed it, without making them feel like they\'re being sold something new?' },
                    { type: 'image', layout: 'wide', src: '', alt: 'Zapp Account hero screens' },
                    { type: 'text', body: 'Multiple rounds of conversations with the HDFC team helped shape this. The goal wasn\'t to hide the history of PayZapp — it was to build on it. Existing users needed continuity. New users needed a reason to care.' },
                    { type: 'text', body: 'Two things had to be true from the start:\n• Give users real value, immediately. Not a promise of features later — actual utility from day one.\n• Don\'t make it feel like a migration. The transition from PayZapp Wallet to Zapp Account had to feel like an upgrade, not a replacement.\nThis shaped every design decision that followed.' }
                ] },
                { id: 'design', label: 'Design', blocks: [
                    { type: 'section-label', label: 'Design' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'Rounds of iteration' },
                    { type: 'text', body: 'Nothing came easy. The product went through multiple rounds of direction changes — across product managers, bank leadership, and internal teams. Information architecture was rethought more than once. What looked right one week got challenged the next.' },
                    { type: 'image', layout: 'wide', src: '', alt: 'Zapp Account hero screens' },
                    { type: 'text', body: 'Every round made the product sharper. Here\'s what we landed on.' },
                    { type: 'horizontal', headline: 'Let’s Onboard you', text: 'Getting a new user in — someone with no HDFC history — required a flow that felt fast and guided. We refined the onboarding to reduce friction at every step, with Video KYC as the centrepiece. The handoff to and from the SDK had to feel seamless.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'horizontal', headline: 'Homepage', text: 'The home screen is the product\'s first argument. Balance visible immediately, actions within reach, nothing buried. One screen that tells the user exactly what they have and what they can do.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'horizontal', headline: 'Balance & Delight', text: 'The balance display wasn\'t just a number — it was an interaction moment. A small but deliberate detail that made the product feel alive rather than static. Useful information delivered with a bit of character.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'horizontal', headline: 'Nudges', text: 'Each action on the home screen carried a nudge — a short contextual cue that told users what it did and why it mattered. Especially important for users coming in fresh, with no prior PayZapp context.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } },
                    { type: 'horizontal', headline: 'GTM & Revamp', text: 'Late in the process, a visual refresh tightened the product\'s language further. Alongside this, the GTM thinking shaped how the product introduced itself to both returning PayZapp users and new ones — making sure neither felt like they were being sold something unfamiliar.', media: { type: 'image', src: '', alt: 'Zapp Account hero screens', device: 'wide' } }
                ] },
                { id: 'impact', label: 'Impact', blocks: [
                    { type: 'section-label', label: 'Impact' },
                    { type: 'text', body: 'Nothing came easy. The product went through multiple rounds of direction changes — across product managers, bank leadership, and internal teams. Information architecture was rethought more than once. What looked right one week got challenged the next.' },
                    { type: 'text', body: 'Every round made the product sharper. Here\'s what we landed on.' },
                    { type: 'image', layout: '3-col', src: '', alt: 'Zapp Account hero screens' }
                ] },
                { id: 'next-phase', label: 'Next Phase', blocks: [
                    { type: 'section-label', label: 'Next phase' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'What we planned further' },
                    { type: 'text', body: 'Nothing came easy. The product went through multiple rounds of direction changes — across product managers, bank leadership, and internal teams. Information architecture was rethought more than once. What looked right one week got challenged the next.' },
                    { type: 'text', body: 'Every round made the product sharper. Here\'s what we landed on.' }
                ] },
                { id: 'reflection', label: 'Reflection', indexLabel: 'Reflections', blocks: [
                    { type: 'section-label', label: 'Reflection' },
                    { type: 'text', body: 'My role shifted across this project. I started in the thinking phase — direction, system, flow architecture. I ended up sitting with developersdaily, going screen by screen, making sure what shipped matched whatwas designed.' },
                    { type: 'text', body: 'The pixel-perfect phase isn\'t vanity. When you\'re rebuilding trust in a product people have written off, every rough edge is a reason to leave again.' },
                    { type: 'text', body: 'The hardest call wasn\'t a design decision. It was arguing for a focused launch — pushing back on the feature list, convincing stakeholders that a wallet which earns one user\'s trust completely is worth more than one that half-impresses everyone. That\'s the one I\'m most proud of.' }
                ] }
            ]
        },
        'growth-experiments': {
            id: 'growth-experiments',
            title: 'Growth Experiments — Zeta Pay',
            subtitle: 'Turning festivals and seasons into interactive product moments for millions of PayZapp users.',
            meta: [
                { key: 'platform', label: 'Platform', value: 'iOS, Android' },
                { key: 'role',     label: 'Role',     value: 'UX Designer II' },
                { key: 'team',     label: 'Team',     value: '5 Designers' },
                { key: 'timeline', label: 'Timeline', value: 'Growth experiments' }
            ],
            hero: { type: 'image', src: 'asset/water.png', alt: 'Growth Experiments hero' },
            sections: [
                { id: 'overview', label: 'Overview', blocks: [
                    { type: 'section-label', label: 'Overview' },
                    { type: 'text', body: 'PayZapp is HDFC Bank\'s payments app — one of India\'s most widely used banking products. With a large existing user base and even larger competition, the challenge isn\'t just retention. It\'s relevance.' },
                    { type: 'text', body: 'Growth experiments were our way of staying relevant. Seasonal campaigns, interactive moments, gamified rewards — each one designed to give users a reason to open the app beyond a transaction. New users discovered PayZapp through these campaigns. Existing users found new reasons to stay.' }
                ] },
                { id: 'cross-sell', label: 'Cross-sell', blocks: [
                    { type: 'meta' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'Cross-sell.' },
                    { type: 'image', layout: 'wide', src: '', alt: 'Cross-sell Holi campaign screens' },
                    { type: 'text', body: 'Holi gave us a canvas. The brief was simple: cross-sell one product to a user in a way that felt festive, not forced. Every user got one unique item — curated for them — hidden inside an interactive Holi box. Open it, explore it, discover what\'s inside. A single cross-sell moment wrapped in something genuinely delightful.' },
                    { type: 'section-label', label: 'Overview' },
                    { type: 'eyebrow-heading', eyebrow: '', headline: 'Cross-sell on a payments app is a hard problem.' },
                    { type: 'image', layout: '2-col', items: [
                        { src: '', alt: 'Ignored banner', caption: 'Banner gets ignored' },
                        { src: '', alt: 'Dismissed pop-up', caption: 'Pop-up gets dismissed' }
                    ], caption: '' },
                    { type: 'text', body: 'We needed a format where the user wanted to engage before they even knew a product was waiting on the other side. Holi — tactile, playful, built around surprise and colour — was the perfect wrapper for that idea. The festival didn\'t just set the visual tone, it justified the interaction model.' },
                    { type: 'bento', items: [
                        { src: '', alt: 'Cross-sell interaction screen 1' },
                        { src: '', alt: 'Cross-sell interaction screen 2' },
                        { src: '', alt: 'Cross-sell interaction screen 3' },
                        { src: '', alt: 'Cross-sell interaction screen 4' },
                        { src: '', alt: 'Cross-sell interaction screen 5' },
                        { src: '', alt: 'Cross-sell interaction screen 6' }
                    ] },
                    { type: 'section-label', label: 'Impact' },
                    { type: 'text', body: 'The point was not to make a campaign banner look festive. It was to turn a product recommendation into a small act of discovery — one where surprise came before the sell.' },
                    { type: 'image', layout: '3-col', src: '', alt: 'Cross-sell final campaign screens' }
                ] },
                { id: 'project-three', label: 'Offer Discovery', blocks: offerDiscoveryBlocks() },
                { id: 'project-four', label: 'Project 04', blocks: [
                    { type: 'section-label', label: 'Project 04' },
                    { type: 'text', body: 'This campaign section will be added later.' }
                ] },
                { id: 'reflection', label: 'Reflection', indexLabel: 'Reflections', blocks: [
                    { type: 'section-label', label: 'Reflection' },
                    { type: 'text', body: 'Growth experiments sat in a useful space between product design and campaign design. They had to work like product surfaces, but feel timed, playful, and worth opening.' },
                    { type: 'text', body: 'The strongest version of these moments came when the campaign mechanic carried the product idea instead of sitting on top of it.' }
                ] }
            ]
        },
        'project-3': {
            id: 'project-3',
            title: 'Butterfly Meadow',
            subtitle: 'Whimsical landscape with fluttering butterflies in a sun-drenched field.',
            meta: defaultMeta(),
            hero: { type: 'image', src: 'asset/project-3-night-meadow-background.jpg', alt: 'Butterfly Meadow hero' },
            sections: [
                { id: 'overview', label: 'Overview', blocks: [
                    { type: 'section-label', label: 'Overview' },
                    { type: 'text', body: '' }
                ] },
                { id: 'process', label: 'Process', blocks: [
                    { type: 'section-label', label: 'Process' },
                    { type: 'text', body: '' }
                ] },
                { id: 'reflection', label: 'Reflection', indexLabel: 'Reflections', blocks: [
                    { type: 'section-label', label: 'Reflection' },
                    { type: 'text', body: '' }
                ] }
            ]
        },
        'now-and-me': {
            id: 'now-and-me',
            title: 'Now&Me',
            subtitle: 'App revamp, design system, and website — 9 months at Now&Me.',
            meta: [
                { key: 'timeline', label: 'Timeline', value: 'Jan 2023 – Sep 2023' },
                { key: 'platform', label: 'Platform', value: 'iOS, Android, Web' },
                { key: 'role',     label: 'Role',     value: 'Product Designer' },
                { key: 'team',     label: 'Team',     value: '' }
            ],
            hero: { type: 'image', src: 'asset/project-4-green-background.jpg', alt: 'Now&Me hero' },
            sections: [
                { id: 'overview', label: 'Overview', blocks: [
                    { type: 'section-label', label: 'Overview' },
                    { type: 'text', body: '' }
                ] },
                { id: 'process', label: 'Process', blocks: [
                    { type: 'section-label', label: 'Process' },
                    { type: 'text', body: '' }
                ] },
                { id: 'design', label: 'Design', blocks: [
                    { type: 'section-label', label: 'Design' },
                    { type: 'text', body: '' }
                ] },
                { id: 'reflection', label: 'Reflection', indexLabel: 'Reflections', blocks: [
                    { type: 'section-label', label: 'Reflection' },
                    { type: 'text', body: '' }
                ] }
            ]
        }
    };

    /* ---------------------------------------------------------------------------
       STATE
       --------------------------------------------------------------------------- */

    let doc = null;
    // Keep the in-place editor available while case studies are still being built.
    let mode = 'view';
    try {
        const storedMode = sessionStorage.getItem(`cs-editor-mode:${CASE_ID}`);
        if (storedMode === 'edit') mode = 'edit';
    } catch (e) { /* storage unavailable */ }
    let saveTimer = null;
    let savedFlashTimer = null;
    let indexRaf = 0;
    let activeIndexTarget = '';
    let activeMediaSlot = null;
    let richTextToolbar = null;
    let activeEditableNode = null;

    function uid() {
        return 'b' + Math.random().toString(36).slice(2, 10);
    }

    function offerDiscoveryBlocks() {
        return [
            { type: 'meta' },
            { type: 'eyebrow-heading', eyebrow: '', headline: 'Offer Discovery' },
            { type: 'text', body: '<em>First Transaction Offer, Scratch Card &amp; Spin the Wheel</em>' },
            { type: 'section-label', label: 'Overview' },
            { type: 'text', body: 'PayZapp had offers. Users just didn\'t know. These three campaigns were built to fix that — surfacing existing offers through interactive moments instead of static listings. A first-transaction animation for new users, a scratch card mechanic for existing ones, and a spin-the-wheel experience that took users to a dedicated page and landed them on a personalised offer they could claim.' },
            { type: 'section-label', label: 'Why' },
            { type: 'text', body: 'A discount buried in a tab doesn\'t drive behaviour. Delight does. We took what was already there and made it impossible to ignore.' },
            { type: 'text', body: '<em>Mix of solo work and team collaboration across the three campaigns.</em>' },
            { type: 'image', layout: 'wide', src: '', alt: 'Offer Discovery campaign screens', hideCaptions: true },
            { type: 'section-label', label: 'Impact' },
            { type: 'text', body: 'Improved offer awareness and claim rates. Numbers TBD.' }
        ];
    }

    function ensureGrowthOfferDiscoverySection(targetDoc) {
        if (CASE_ID !== 'growth-experiments' || !targetDoc || !Array.isArray(targetDoc.sections)) return;
        const section = targetDoc.sections.find((item) => item.id === 'project-three');
        if (!section) return;
        const isOldPlaceholder = section.label === 'Project 03'
            || (Array.isArray(section.blocks)
                && section.blocks.length <= 2
                && section.blocks.some((block) => block.body === 'This campaign section will be added later.'));
        if (!isOldPlaceholder) return;
        section.label = 'Offer Discovery';
        section.blocks = offerDiscoveryBlocks();
        ensureIds(targetDoc);
    }

    function applyLocalCaseStudyAssetDefaults(targetDoc) {
        if (CASE_ID !== 'zapp-account' || !targetDoc || !Array.isArray(targetDoc.sections)) return false;
        let changed = false;
        ZAPP_LOCAL_MEDIA_PATCHES.forEach((patch) => {
            const [sectionId, blockIndex, childKey] = patch.path;
            const section = targetDoc.sections.find((item) => item.id === sectionId);
            const block = section && Array.isArray(section.blocks) ? section.blocks[blockIndex] : null;
            const target = childKey ? block && block[childKey] : block;
            if (!target || typeof target !== 'object') return;
            if (typeof target.src === 'string' && target.src.trim()) return;
            target.src = patch.src;
            target.mediaMimeType = patch.mimeType;
            if (childKey && block && !block.mediaMimeType) block.mediaMimeType = patch.mimeType;
            changed = true;
        });
        return changed;
    }

    function ensureIds(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.sections)) {
            node.sections.forEach((s) => {
                if (!s.uid) s.uid = uid();
                ensureBlockIds(s.blocks);
            });
        }
    }

    function ensureBlockIds(blocks) {
        (blocks || []).forEach((b) => {
            if (!b.uid) b.uid = uid();
            if (b.type === 'columns') {
                (b.columns || []).forEach((col) => {
                    if (!col.uid) col.uid = uid();
                    ensureBlockIds(col.blocks);
                });
            }
            if (Array.isArray(b.items)) b.items.forEach((it) => { if (!it.uid) it.uid = uid(); });
            if (b.media && !b.media.uid) b.media.uid = uid();
        });
    }

    function loadDocFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.sections)) return null;
            ensureIds(parsed);
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function fallbackDoc() {
        const fallback = clone(DEFAULT_DOCS[CASE_ID] || { id: CASE_ID, title: '', subtitle: '', sections: [] });
        ensureIds(fallback);
        return fallback;
    }

    async function loadBundledDoc() {
        const path = BUNDLED_CONTENT_PATHS[CASE_ID];
        if (!path) return fallbackDoc();
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) return fallbackDoc();
            const parsed = await response.json();
            if (!parsed || parsed.id !== CASE_ID || !Array.isArray(parsed.sections)) return fallbackDoc();
            ensureIds(parsed);
            return parsed;
        } catch (e) {
            return fallbackDoc();
        }
    }

    async function resolveDoc() {
        const stored = loadDocFromStorage();
        if (stored) return stored;
        return loadBundledDoc();
    }

    function loadDoc() {
        return loadDocFromStorage() || fallbackDoc();
    }

    function clone(v) { return JSON.parse(JSON.stringify(v)); }

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
            return true;
        } catch (e) {
            flashSaved('Save failed');
            return false;
        }
    }

    function schedulePersist() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (persist()) flashSaved();
        }, 250);
    }

    function flashSaved(message = 'Saved') {
        const el = document.querySelector('.cs-editor-toolbar__status');
        if (!el) return;
        el.textContent = message;
        el.dataset.state = 'saved';
        if (savedFlashTimer) clearTimeout(savedFlashTimer);
        savedFlashTimer = setTimeout(() => { el.textContent = ''; el.dataset.state = 'idle'; }, 1400);
    }

    /* ---------------------------------------------------------------------------
       DOM HELPERS
       --------------------------------------------------------------------------- */

    function el(tag, opts = {}, ...children) {
        const node = document.createElement(tag);
        if (opts.class) node.className = opts.class;
        if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => { if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v); });
        if (opts.dataset) Object.entries(opts.dataset).forEach(([k, v]) => { if (v != null) node.dataset[k] = v; });
        if (opts.text != null) node.textContent = opts.text;
        if (opts.html != null) node.innerHTML = opts.html;
        if (opts.on) Object.entries(opts.on).forEach(([ev, fn]) => node.addEventListener(ev, fn));
        children.forEach((c) => { if (c == null) return; node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return node;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch]);
    }

    function sanitizeEditableHtml(value) {
        const source = String(value || '');
        const template = document.createElement('template');
        template.innerHTML = source;
        const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR']);

        function cleanNode(node) {
            if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
            if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
            const tag = node.tagName;
            const children = Array.from(node.childNodes).map(cleanNode);
            if (!allowed.has(tag)) {
                const frag = document.createDocumentFragment();
                children.forEach((child) => frag.appendChild(child));
                return frag;
            }
            const normalizedTag = tag === 'B' ? 'strong' : (tag === 'I' ? 'em' : tag.toLowerCase());
            const next = document.createElement(normalizedTag);
            children.forEach((child) => next.appendChild(child));
            return next;
        }

        const output = document.createElement('div');
        Array.from(template.content.childNodes).forEach((child) => output.appendChild(cleanNode(child)));
        return output.innerHTML
            .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
            .trim();
    }

    function editableValueFromNode(node) {
        const html = sanitizeEditableHtml(node.innerHTML);
        const probe = document.createElement('div');
        probe.innerHTML = html;
        return probe.querySelector('strong, em, u, br') ? html : (probe.textContent || '');
    }

    function setEditableHtml(node, value) {
        const source = String(value || '');
        if (/<\/?(strong|b|em|i|u|br)\b/i.test(source)) {
            node.innerHTML = sanitizeEditableHtml(source);
        } else {
            node.textContent = source;
        }
    }

    function splitBody(value) {
        return String(value || '').split(/\n\s*\n/g).map(s => s.trim()).filter(Boolean);
    }

    function sectionIdFor(section) {
        return SECTION_ID_MAP[section.id] || `cs-editor-${section.id || section.uid}`;
    }

    /* ---------------------------------------------------------------------------
       MEDIA STORAGE — base64 inline. Keeps everything in localStorage so it
       works offline without a server. (Be mindful of size; small images only.)
       --------------------------------------------------------------------------- */

    function pickFile(accept) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.style.display = 'none';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                resolve(file || null);
                input.remove();
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        });
    }

    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function dataUrlToBlob(dataUrl) {
        const [meta, payload] = String(dataUrl || '').split(',');
        const mimeMatch = /^data:([^;]+);base64$/i.exec(meta || '');
        if (!mimeMatch || !payload) return null;
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mimeMatch[1] });
    }

    function extensionFromFile(file) {
        const fromName = file && file.name && file.name.includes('.')
            ? file.name.split('.').pop().toLowerCase()
            : '';
        if (fromName) return fromName;
        const mime = file && file.type ? file.type.split('/').pop() : '';
        return mime || 'bin';
    }

    function assetRef(id) {
        return `${ASSET_REF_PREFIX}${id}`;
    }

    function isAssetRef(value) {
        return typeof value === 'string' && value.startsWith(ASSET_REF_PREFIX);
    }

    function assetIdFromRef(value) {
        return isAssetRef(value) ? value.slice(ASSET_REF_PREFIX.length) : '';
    }

    function openAssetDb() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const request = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('assets')) {
                    db.createObjectStore('assets', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveAssetFile(file) {
        const id = `${CASE_ID}:${Date.now()}:${uid()}`;
        const record = {
            id,
            caseId: CASE_ID,
            blob: file,
            name: file && file.name ? file.name : `clipboard-${Date.now()}.${extensionFromFile(file)}`,
            mimeType: file && file.type ? file.type : '',
            size: file && typeof file.size === 'number' ? file.size : null,
            createdAt: new Date().toISOString()
        };
        const db = await openAssetDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readwrite');
            tx.objectStore('assets').put(record);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        return { ref: assetRef(id), record };
    }

    async function migrateInlineMediaAssets() {
        const updates = [];
        function queue(block, field = 'src') {
            if (!block || typeof block !== 'object') return;
            const src = block[field];
            if (typeof src !== 'string' || !/^data:(image|video)\//i.test(src)) return;
            updates.push({ block, field, src });
        }
        function visit(block) {
            if (!block || typeof block !== 'object') return;
            queue(block, 'src');
            if (block.media) visit(block.media);
            if (Array.isArray(block.items)) block.items.forEach(visit);
            if (Array.isArray(block.columns)) {
                block.columns.forEach((col) => (col.blocks || []).forEach(visit));
            }
        }
        if (doc.hero) visit(doc.hero);
        (doc.sections || []).forEach((section) => (section.blocks || []).forEach(visit));
        if (!updates.length) return false;

        for (const item of updates) {
            const blob = dataUrlToBlob(item.src);
            if (!blob) continue;
            const savedAsset = await saveAssetFile(blob);
            item.block[item.field] = savedAsset.ref;
            item.block.mediaMimeType = blob.type || mimeTypeFromDataUrl(item.src);
            markLocalAsset(item.block, item.field, blob, savedAsset.ref);
        }
        return updates.length > 0;
    }

    async function getAssetRecord(ref) {
        const id = assetIdFromRef(ref);
        if (!id) return null;
        const db = await openAssetDb();
        const record = await new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readonly');
            const request = tx.objectStore('assets').get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return record;
    }

    async function resolveAssetSrc(src) {
        if (!isAssetRef(src)) return src;
        if (LOCAL_ASSET_OVERRIDES[src]) return LOCAL_ASSET_OVERRIDES[src];
        if (assetUrlCache.has(src)) return assetUrlCache.get(src);
        const record = await getAssetRecord(src);
        if (!record || !record.blob) return '';
        const url = URL.createObjectURL(record.blob);
        assetUrlCache.set(src, url);
        return url;
    }

    function isVideoFile(file) {
        if (!file) return false;
        if (file.type && file.type.startsWith('video/')) return true;
        const name = file.name || '';
        return /\.(mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(name);
    }

    function mimeTypeFromDataUrl(src) {
        if (typeof src !== 'string' || !src.startsWith('data:')) return '';
        const end = src.indexOf(';');
        return end > 5 ? src.slice(5, end) : '';
    }

    function isGifMedia(block, field = 'src') {
        if (!block) return false;
        const src = block[field] || '';
        const localOverride = LOCAL_ASSET_OVERRIDES[src] || '';
        const mimeType = block.mediaMimeType || (block.localAsset && block.localAsset.mimeType) || mimeTypeFromDataUrl(src);
        const originalName = block.localAsset && block.localAsset.originalName ? block.localAsset.originalName : '';
        return mimeType === 'image/gif'
            || /\.gif(?:$|[?#])/i.test(String(src))
            || /\.gif(?:$|[?#])/i.test(localOverride)
            || /\.gif$/i.test(originalName);
    }

    function markLocalAsset(block, field, file, sourceRef) {
        const mediaKind = isVideoFile(file) ? 'video' : 'image';
        block.localAsset = {
            status: 'local',
            field,
            originalName: file && file.name ? file.name : `clipboard-${Date.now()}.${extensionFromFile(file)}`,
            mimeType: file && file.type ? file.type : '',
            size: file && typeof file.size === 'number' ? file.size : null,
            resourceType: mediaKind === 'video' ? 'video' : 'image',
            ref: sourceRef || '',
            createdAt: new Date().toISOString()
        };
    }

    /* ---------------------------------------------------------------------------
       RENDERERS — every block returns an element decorated with the block's
       UID, so the editor can re-target updates without re-rendering everything.
       --------------------------------------------------------------------------- */

    function captionEl(value, block, field = 'caption') {
        const cap = el('figcaption', { class: 'cs-section__caption' });
        applyEditable(cap, block, field, value || '');
        cap.dataset.placeholder = 'Add a caption';
        return cap;
    }

    function mediaSlot(block, field = 'src', altField = 'alt', options = {}) {
        const src = block[field];
        const isVideo = isVideoMedia(block, field);
        const isGif = !isVideo && isGifMedia(block, field);
        const hasMedia = src && typeof src === 'string' && src.length > 0 && !src.startsWith('REPLACE_WITH_');
        const isHero = options.priority === 'hero';
        const slot = el('div', {
            class: `cs-editor-media-slot${hasMedia ? ' cs-editor-media-slot--filled' : ''}${isVideo ? ' cs-editor-media-slot--video' : ''}${isGif ? ' cs-editor-media-slot--gif-crop' : ''}`,
            dataset: { field, altField, blockUid: block.uid },
            attrs: mode === 'edit'
                ? { tabindex: '0', 'aria-label': 'Media slot. Paste, drop, or click to add media.' }
                : {}
        });

        if (hasMedia) {
            if (isVideo) {
                const mimeType = block.mediaMimeType || (block.localAsset && block.localAsset.mimeType) || mimeTypeFromDataUrl(src);
                const video = el('video', {
                    attrs: {
                        controls: true,
                        muted: true,
                        playsinline: true,
                        preload: isHero ? 'auto' : 'metadata'
                    }
                }, el('source', {
                    attrs: {
                        src: isAssetRef(src) ? '' : src,
                        type: mimeType || 'video/mp4'
                    }
                }));
                slot.appendChild(video);
                if (isAssetRef(src)) {
                    resolveAssetSrc(src).then((resolvedSrc) => {
                        const source = video.querySelector('source');
                        if (resolvedSrc && source) {
                            source.setAttribute('src', resolvedSrc);
                            video.load();
                        }
                    }).catch(() => {});
                }
            } else {
                const img = el('img', {
                    attrs: {
                        src: isAssetRef(src) ? '' : src,
                        alt: block[altField] || '',
                        decoding: 'async',
                        loading: isHero ? 'eager' : 'lazy',
                        fetchpriority: isHero ? 'high' : 'auto'
                    }
                });
                slot.appendChild(img);
                if (isAssetRef(src)) {
                    resolveAssetSrc(src).then((resolvedSrc) => {
                        if (resolvedSrc) img.setAttribute('src', resolvedSrc);
                    }).catch(() => {});
                }
            }
        } else {
            const ph = el('div', {
                class: `placeholder-graphic${isVideo ? ' placeholder-graphic--video' : ''}`,
                dataset: { src: '' },
                attrs: { role: 'img', 'aria-label': block[altField] || 'Drop image' }
            });
            slot.appendChild(ph);

            const hint = el('div', { class: 'cs-editor-media-slot__hint', text: isVideo ? 'Paste, drop, or click for video' : 'Paste, drop, or click for image or video' });
            slot.appendChild(hint);
        }

        wireMediaSlot(slot, block, field, isVideo);
        return slot;
    }

    function wireMediaSlot(slot, block, field, isVideo) {
        const accept = isVideo ? 'video/*' : 'image/*,video/*';

        const apply = async (file) => {
            if (!file) return;
            try {
                const savedAsset = await saveAssetFile(file);
                block[field] = savedAsset.ref;
                if (isVideoFile(file)) {
                    block.mediaType = 'video';
                    block.mediaMimeType = file.type || 'video/mp4';
                } else if (file.type && file.type.startsWith('image/')) {
                    block.mediaType = 'image';
                    block.mediaMimeType = file.type;
                }
                markLocalAsset(block, field, file, savedAsset.ref);
                if (!block.alt && file.name) block.alt = file.name.replace(/\.[^.]+$/, '');
                schedulePersist();
                // Re-render just this block's parent section for a clean update.
                renderAll();
            } catch (e) {
                try {
                    const dataUrl = await readAsDataURL(file);
                    block[field] = dataUrl;
                    block.mediaMimeType = file.type || mimeTypeFromDataUrl(dataUrl);
                    markLocalAsset(block, field, file, dataUrl);
                    schedulePersist();
                    renderAll();
                } catch (fallbackError) {
                    flashSaved('Upload failed');
                }
            }
        };

        slot.addEventListener('click', async (ev) => {
            if (mode !== 'edit') return;
            // Don't hijack clicks on editable text
            if (ev.target.closest('[contenteditable]')) return;
            ev.preventDefault();
            activeMediaSlot = { slot, block, field, isVideo, apply };
            const file = await pickFile(accept);
            if (file) apply(file);
        });

        slot.addEventListener('focusin', () => {
            if (mode !== 'edit') return;
            activeMediaSlot = { slot, block, field, isVideo, apply };
        });

        slot.addEventListener('mouseenter', () => {
            if (mode !== 'edit') return;
            activeMediaSlot = { slot, block, field, isVideo, apply };
        });

        slot.addEventListener('dragover', (ev) => {
            if (mode !== 'edit') return;
            ev.preventDefault();
            activeMediaSlot = { slot, block, field, isVideo, apply };
            slot.classList.add('is-drop-target');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('is-drop-target'));
        slot.addEventListener('drop', (ev) => {
            if (mode !== 'edit') return;
            ev.preventDefault();
            slot.classList.remove('is-drop-target');
            const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
            if (file) apply(file);
        });
    }

    function isVideoMedia(block, field = 'src') {
        const src = block && block[field];
        return (block && block.type === 'video')
            || (block && block.media && block.media.type === 'video')
            || (block && block.mediaType === 'video')
            || (typeof src === 'string' && src.startsWith('data:video'));
    }

    function clipboardMediaFile(event, isVideo) {
        const accepted = isVideo ? ['video/'] : ['image/', 'video/'];
        const items = event.clipboardData && event.clipboardData.items
            ? Array.from(event.clipboardData.items)
            : [];
        const item = items.find((entry) =>
            entry.kind === 'file' &&
            entry.type &&
            accepted.some((prefix) => entry.type.startsWith(prefix))
        );
        if (item) return item.getAsFile();

        const files = event.clipboardData && event.clipboardData.files
            ? Array.from(event.clipboardData.files)
            : [];
        return files.find((file) =>
            file.type &&
            accepted.some((prefix) => file.type.startsWith(prefix))
        ) || null;
    }

    function handleMediaPaste(event) {
        if (mode !== 'edit') return;
        if (!activeMediaSlot || !activeMediaSlot.slot || !activeMediaSlot.slot.isConnected) return;
        const target = event.target;
        if (target && target.closest && target.closest('[contenteditable]')) return;

        const file = clipboardMediaFile(event, activeMediaSlot.isVideo);
        if (!file) return;

        event.preventDefault();
        activeMediaSlot.slot.classList.add('is-drop-target');
        activeMediaSlot.apply(file).finally(() => {
            if (activeMediaSlot && activeMediaSlot.slot) {
                activeMediaSlot.slot.classList.remove('is-drop-target');
            }
        });
    }

    /* ---------- Inline-editable text wiring ---------- */

    function applyEditable(node, target, field, value) {
        setEditableHtml(node, value || '');
        if (mode === 'edit') {
            node.setAttribute('contenteditable', 'true');
            node.dataset.field = field;
            node._csEditableTarget = target;
            node._csEditableField = field;
            node.addEventListener('pointerdown', (ev) => {
                if ((node.textContent || '').trim()) return;
                ev.preventDefault();
                node.focus();
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();
                range.selectNodeContents(node);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            });
            node.addEventListener('focus', () => {
                activeEditableNode = node;
            });
            node.addEventListener('input', () => {
                target[field] = editableValueFromNode(node);
                schedulePersist();
            });
            node.addEventListener('blur', () => {
                target[field] = editableValueFromNode(node);
                schedulePersist();
            });
            node.addEventListener('paste', () => {
                setTimeout(() => {
                    target[field] = editableValueFromNode(node);
                    setEditableHtml(node, target[field]);
                    schedulePersist();
                }, 0);
            });
        }
    }

    function buildRichTextToolbar() {
        if (richTextToolbar) return richTextToolbar;
        const bar = el('div', { class: 'cs-rich-text-toolbar', attrs: { contenteditable: 'false', role: 'toolbar', 'aria-label': 'Text style' } });
        [
            { cmd: 'bold', label: 'B', title: 'Bold' },
            { cmd: 'italic', label: 'I', title: 'Italic' },
            { cmd: 'underline', label: 'U', title: 'Underline' }
        ].forEach(({ cmd, label, title }) => {
            const btn = el('button', { class: `cs-rich-text-toolbar__btn cs-rich-text-toolbar__btn--${cmd}`, attrs: { type: 'button', title }, text: label });
            btn.addEventListener('mousedown', (ev) => ev.preventDefault());
            btn.addEventListener('click', () => applyRichTextCommand(cmd));
            bar.appendChild(btn);
        });
        document.body.appendChild(bar);
        richTextToolbar = bar;
        return bar;
    }

    function hideRichTextToolbar() {
        if (richTextToolbar) richTextToolbar.classList.remove('is-visible');
    }

    function selectedEditableNode() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const node = selection.anchorNode;
        const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
        return element && element.closest ? element.closest('[contenteditable="true"]') : null;
    }

    function updateRichTextToolbar() {
        if (mode !== 'edit') {
            hideRichTextToolbar();
            return;
        }
        const editable = selectedEditableNode();
        if (!editable) {
            hideRichTextToolbar();
            return;
        }
        activeEditableNode = editable;
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) {
            hideRichTextToolbar();
            return;
        }
        const bar = buildRichTextToolbar();
        bar.style.left = `${Math.min(window.innerWidth - 120, Math.max(12, rect.left + rect.width / 2))}px`;
        bar.style.top = `${Math.max(12, rect.top - 42)}px`;
        bar.classList.add('is-visible');
    }

    function applyRichTextCommand(command) {
        if (!activeEditableNode) return;
        activeEditableNode.focus();
        try { document.execCommand(command, false, null); } catch (e) { return; }
        const target = activeEditableNode._csEditableTarget;
        const field = activeEditableNode._csEditableField;
        if (target && field) {
            target[field] = editableValueFromNode(activeEditableNode);
            schedulePersist();
        }
        updateRichTextToolbar();
    }

    /* ---------- Block renderers ---------- */

    function renderTextBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--text', dataset: { blockUid: block.uid } });
        const p = el('p', { class: 'cs-section__body' });
        p.dataset.placeholder = 'Write something…';
        applyEditable(p, block, 'body', block.body);
        wrap.appendChild(p);
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderSectionLabelBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--section-label', dataset: { blockUid: block.uid } });
        const label = el('p', { class: 'cs-section__label' });
        label.dataset.placeholder = 'Section label';
        applyEditable(label, block, 'label', block.label || '');
        wrap.appendChild(label);
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderMetaBlock(block) {
        const wrap = el('dl', { class: 'cs-block cs-block--meta cs-page-header__meta cs-meta-inline', dataset: { blockUid: block.uid } });
        if (!Array.isArray(doc.meta)) doc.meta = defaultMeta();
        doc.meta.forEach((cell, i) => {
            const item = el('div', { class: 'cs-meta-cell', dataset: { metaIdx: i } });
            const dt = el('dt', { class: 'cs-meta-cell__label' });
            applyEditable(dt, cell, 'label', cell.label || '');
            const dd = el('dd', { class: 'cs-meta-cell__value' });
            applyEditable(dd, cell, 'value', cell.value || '');
            item.appendChild(dt);
            item.appendChild(dd);
            wrap.appendChild(item);
        });
        decorateBlock(wrap, block);
        return wrap;
    }

    function columnsFromLayout(layout, fallback) {
        const s = String(layout || '');
        if (s.includes('5')) return 5;
        if (s.includes('4')) return 4;
        if (s.includes('3')) return 3;
        if (s.includes('2')) return 2;
        return fallback || 1;
    }

    function renderImageBlock(block) {
        const layout = block.layout || '1-col';
        const showCaptions = block.hideCaptions !== true;
        const wrap = el('figure', { class: 'cs-block cs-block--image', dataset: { blockUid: block.uid } });

        if (layout === 'fullbleed') {
            wrap.classList.add('cs-media-full', 'cs-editor-media', 'cs-editor-media--full');
            wrap.appendChild(mediaSlot(block));
            if (showCaptions) wrap.appendChild(captionEl(block.caption, block));
        } else if (layout === 'wide') {
            wrap.classList.add('cs-editor-media', 'cs-editor-media--full');
            wrap.appendChild(mediaSlot(block));
            if (showCaptions) wrap.appendChild(captionEl(block.caption, block));
        } else {
            const cols = columnsFromLayout(layout, 3);
            wrap.classList.add('cs-media-grid', `cs-media-grid--cols-${cols}`, 'cs-editor-media', 'cs-editor-media--grid');

            // image grid supports per-item sources via block.items (optional)
            if (!Array.isArray(block.items) || block.items.length !== cols) {
                block.items = Array.from({ length: cols }, (_, i) => block.items?.[i] || { src: '', alt: '' });
            }

            block.items.forEach((item, i) => {
                if (!item.uid) item.uid = uid();
                const cell = el('div', { class: 'cs-editor-media__item', dataset: { itemUid: item.uid } });
                cell.appendChild(mediaSlot(item, 'src', 'alt'));

                const calloutText = Array.isArray(block.callouts) ? block.callouts[i] : null;
                const labelText = Array.isArray(block.labels) ? block.labels[i] : null;
                const subtitle = item.caption || calloutText || labelText || '';
                if (showCaptions) {
                    const cap = el('figcaption', { class: 'cs-section__caption' });
                    cap.dataset.placeholder = 'Add a label';
                    applyEditable(cap, item, 'caption', subtitle);
                    cell.appendChild(cap);
                }
                wrap.appendChild(cell);
            });

        }

        decorateBlock(wrap, block);
        return wrap;
    }

    function renderBentoBlock(block) {
        const showCaptions = block.hideCaptions !== true;
        const wrap = el('figure', {
            class: 'cs-block cs-block--bento cs-bento cs-editor-media cs-editor-media--bento',
            dataset: { blockUid: block.uid }
        });

        if (!Array.isArray(block.items) || block.items.length !== 6) {
            block.items = Array.from({ length: 6 }, (_, i) => block.items?.[i] || { src: '', alt: '' });
        }

        block.items.forEach((item, i) => {
            if (!item.uid) item.uid = uid();
            const cell = el('div', {
                class: `cs-bento__item cs-bento__item--${i + 1}`,
                dataset: { itemUid: item.uid }
            });
            cell.appendChild(mediaSlot(item, 'src', 'alt'));
            wrap.appendChild(cell);
        });

        if (showCaptions) wrap.appendChild(captionEl(block.caption, block));
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderVideoBlock(block) {
        const wrap = el('figure', { class: 'cs-block cs-block--video cs-media-full cs-editor-media cs-editor-media--video', dataset: { blockUid: block.uid } });
        wrap.appendChild(mediaSlot(block, 'src', 'alt'));
        wrap.appendChild(captionEl(block.caption, block));
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderHorizontalBlock(block) {
        const wrap = el('div', {
            class: `cs-block cs-block--horizontal cs-horizontal cs-editor-media cs-editor-media--horizontal${block.reverse ? ' cs-horizontal--reverse' : ''}`,
            dataset: { blockUid: block.uid }
        });

        const textCol = el('div', { class: 'cs-horizontal__text' });
        if (block.headline) {
            const head = el('h3', { class: 'cs-h3' });
            head.dataset.placeholder = 'Heading';
            applyEditable(head, block, 'headline', block.headline);
            textCol.appendChild(head);
        }
        const p = el('p', { class: 'cs-section__body' });
        p.dataset.placeholder = 'Write something…';
        applyEditable(p, block, 'text', block.text);
        textCol.appendChild(p);

        const mediaCol = el('div', { class: 'cs-horizontal__media' });
        const media = block.media || (block.media = { type: 'video', src: '', alt: '', device: 'phone' });
        if (!media.uid) media.uid = uid();
        const frame = el('div', {
            class: `cs-horizontal__frame${media.device === 'phone' ? ' cs-horizontal__frame--phone' : ''}`
        });
        const slot = mediaSlot(media, 'src', 'alt');
        frame.appendChild(slot);
        mediaCol.appendChild(frame);

        wrap.appendChild(textCol);
        wrap.appendChild(mediaCol);
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderComparisonBlock(block) {
        const wrap = el('figure', { class: 'cs-block cs-block--comparison cs-media-comparison cs-editor-media cs-editor-media--comparison', dataset: { blockUid: block.uid } });
        if (!block.labels) block.labels = { before: 'Before', after: 'After' };
        if (!block.beforeSrc) block.beforeSrc = '';
        if (!block.afterSrc) block.afterSrc = '';

        ['before', 'after'].forEach((side) => {
            const item = el('div', { class: `cs-media-comparison__item cs-media-comparison__item--${side}` });
            const tag = el('span', { class: 'cs-media-comparison__label' });
            applyEditable(tag, block.labels, side, block.labels[side]);
            item.appendChild(tag);
            const slot = mediaSlot(block, `${side}Src`, 'alt');
            item.appendChild(slot);
            wrap.appendChild(item);
        });

        wrap.appendChild(captionEl(block.caption, block));
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderMetricsBlock(block) {
        const wrap = el('div', { class: `cs-block cs-block--metrics cs-metrics cs-metrics--${block.style || 'standard'}`, dataset: { blockUid: block.uid } });
        const cap = el('p', { class: 'cs-metrics__caption' });
        cap.dataset.placeholder = 'Optional caption';
        applyEditable(cap, block, 'caption', block.caption || '');
        wrap.appendChild(cap);

        const grid = el('div', { class: 'cs-stats' });
        (block.items || []).forEach((item, i) => {
            if (!item.uid) item.uid = uid();
            const cell = el('div', { class: 'cs-stat', dataset: { itemUid: item.uid, idx: i } });
            const value = el('div', { class: 'cs-stat__value' });
            value.dataset.placeholder = '0%';
            applyEditable(value, item, 'stat', item.stat || '');
            cell.appendChild(value);

            const label = el('div', { class: 'cs-stat__label' });
            label.dataset.placeholder = 'ABC';
            applyEditable(label, item, 'label', item.label || '');
            cell.appendChild(label);

            const note = el('div', { class: 'cs-stat__note' });
            note.dataset.placeholder = 'Note';
            applyEditable(note, item, 'note', item.note || '');
            cell.appendChild(note);

            if (mode === 'edit') {
                const rm = el('button', { class: 'cs-block-toolbar__btn cs-metrics__remove', attrs: { type: 'button', title: 'Remove metric' }, text: '×' });
                rm.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    block.items.splice(i, 1);
                    schedulePersist();
                    renderAll();
                });
                cell.appendChild(rm);
            }
            grid.appendChild(cell);
        });

        if (mode === 'edit') {
            const add = el('button', { class: 'cs-stat cs-stat--add', attrs: { type: 'button' }, text: '+ Add metric' });
            add.addEventListener('click', () => {
                block.items = block.items || [];
                block.items.push({ stat: '', label: '', note: '', uid: uid() });
                schedulePersist();
                renderAll();
            });
            grid.appendChild(add);
        }

        wrap.appendChild(grid);
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderDividerBlock(block) {
        // A section heading. Renders as `## Section title` (big serif/grotesque h2),
        // breaks the rhythm of body text and anchors the section.
        const wrap = el('div', { class: 'cs-block cs-block--divider cs-heading-block', dataset: { blockUid: block.uid } });
        if (!block.label) block.label = 'Section';
        if (!block.id) block.id = (block.label || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        const h = el('h2', { class: 'cs-h2', attrs: { id: block.id } });
        h.dataset.placeholder = 'Section title';
        applyEditable(h, block, 'label', block.label);
        h.addEventListener('blur', () => {
            block.id = (block.label || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
            renderAll();
        });
        wrap.appendChild(h);
        decorateBlock(wrap, block);
        return wrap;
    }

    /* Eyebrow + heading — Kasturi-style `Access / Share flow / AI behavior` group:
       small uppercase eyebrow above an h3. Sub-section within a section. */
    function renderEyebrowHeadingBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--eyebrow-heading cs-eyebrow-heading', dataset: { blockUid: block.uid } });
        const eyebrow = el('p', { class: 'cs-eyebrow' });
        eyebrow.dataset.placeholder = 'Eyebrow';
        applyEditable(eyebrow, block, 'eyebrow', block.eyebrow || '');
        const heading = el('h3', { class: 'cs-h3' });
        heading.dataset.placeholder = 'Sub-section heading';
        applyEditable(heading, block, 'headline', block.headline || '');
        wrap.appendChild(eyebrow);
        wrap.appendChild(heading);
        decorateBlock(wrap, block);
        return wrap;
    }

    /* Impact item — Kasturi's "### Mobile-first sharing made access ..." style:
       bold lead + supporting line, stacked vertically (one per block).  */
    function renderImpactBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--impact cs-impact', dataset: { blockUid: block.uid } });
        const head = el('h3', { class: 'cs-impact__headline' });
        head.dataset.placeholder = 'Headline outcome';
        applyEditable(head, block, 'headline', block.headline || '');
        const body = el('p', { class: 'cs-impact__body' });
        body.dataset.placeholder = 'Supporting line';
        applyEditable(body, block, 'body', block.body || '');
        wrap.appendChild(head);
        wrap.appendChild(body);
        decorateBlock(wrap, block);
        return wrap;
    }

    /* Numbered item — `01 / 02 / 03` index + h3 + supporting body.
       Used inside "The core challenge" style sections. */
    function renderNumberedBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--numbered cs-numbered', dataset: { blockUid: block.uid } });
        const num = el('span', { class: 'cs-numbered__index' });
        num.dataset.placeholder = '01';
        applyEditable(num, block, 'index', block.index || '');
        const head = el('h3', { class: 'cs-numbered__headline' });
        head.dataset.placeholder = 'Title';
        applyEditable(head, block, 'headline', block.headline || '');
        const body = el('p', { class: 'cs-numbered__body' });
        body.dataset.placeholder = 'Supporting paragraph';
        applyEditable(body, block, 'body', block.body || '');
        wrap.appendChild(num);
        wrap.appendChild(head);
        wrap.appendChild(body);
        decorateBlock(wrap, block);
        return wrap;
    }

    /* Pull-quote — large standalone display text (the HMW moment). */
    function renderPullquoteBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--pullquote cs-pullquote', dataset: { blockUid: block.uid } });
        const body = el('p', { class: 'cs-pullquote__body' });
        body.dataset.placeholder = 'A standalone, display-style line.';
        applyEditable(body, block, 'body', block.body || '');
        wrap.appendChild(body);
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderSpacerBlock(block) {
        const size = block.size || 'md';
        const wrap = el('div', {
            class: `cs-block cs-block--spacer cs-spacer cs-spacer--${size}`,
            dataset: { blockUid: block.uid }
        });
        if (mode === 'edit') {
            const hint = el('span', { class: 'cs-spacer__hint', text: `Spacer · ${size.toUpperCase()}` });
            wrap.appendChild(hint);
        }
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderRuleBlock(block) {
        const wrap = el('div', { class: 'cs-block cs-block--rule', dataset: { blockUid: block.uid } });
        wrap.appendChild(el('hr', { class: 'cs-rule' }));
        decorateBlock(wrap, block);
        return wrap;
    }

    function renderColumnsBlock(block) {
        const cols = block.cols || 2;
        const wrap = el('div', {
            class: `cs-block cs-block--columns cs-columns cs-columns--${cols}`,
            dataset: { blockUid: block.uid }
        });

        if (!Array.isArray(block.columns) || block.columns.length !== cols) {
            const existing = block.columns || [];
            block.columns = Array.from({ length: cols }, (_, i) => existing[i] || { uid: uid(), blocks: [] });
        }

        block.columns.forEach((col) => {
            if (!col.uid) col.uid = uid();
            const colNode = el('div', { class: 'cs-column', dataset: { columnUid: col.uid } });
            (col.blocks || []).forEach((child) => {
                const node = renderBlock(child, { uid: col.uid });
                if (!node) return;
                colNode.appendChild(node);
                const ins = renderInserter(child.uid, col.uid);
                if (ins) colNode.appendChild(ins);
            });
            if (mode === 'edit' && (!col.blocks || col.blocks.length === 0)) {
                const ins = renderInserter(null, col.uid);
                if (ins) colNode.appendChild(ins);
                colNode.classList.add('cs-column--empty');
            }
            wrap.appendChild(colNode);
        });

        decorateBlock(wrap, block);
        return wrap;
    }

    /* ---------- Block dispatcher ---------- */

    const BLOCK_REGISTRY = {
        'text':             { label: 'Text',             group: 'basic',     render: renderTextBlock,           layouts: null },
        'section-label':    { label: 'Section label',    group: 'basic',     render: renderSectionLabelBlock,   layouts: null },
        'meta':             { label: 'Meta row',         group: 'basic',     render: renderMetaBlock,           layouts: null },
        'eyebrow-heading':  { label: 'Eyebrow + heading', group: 'basic',    render: renderEyebrowHeadingBlock, layouts: null },
        'impact':           { label: 'Impact item',      group: 'basic',     render: renderImpactBlock,         layouts: null },
        'numbered':         { label: 'Numbered item',    group: 'basic',     render: renderNumberedBlock,       layouts: null },
        'pullquote':        { label: 'Pull-quote',       group: 'basic',     render: renderPullquoteBlock,      layouts: null },
        'metrics':          { label: 'Metrics',          group: 'basic',     render: renderMetricsBlock,        layouts: null, styles: ['standard', 'highlight', 'muted', 'large'] },
        'image':            { label: 'Image',            group: 'media',     render: renderImageBlock,          layouts: ['wide', 'fullbleed', '2-col', '3-col', '4-col', '5-col'] },
        'video':            { label: 'Video',            group: 'media',     render: renderVideoBlock,          layouts: null },
        'horizontal':       { label: 'Text + Media',     group: 'media',     render: renderHorizontalBlock,     layouts: null },
        'comparison':       { label: 'Before / After',   group: 'media',     render: renderComparisonBlock,     layouts: null },
        'bento':            { label: 'Bento grid',       group: 'media',     render: renderBentoBlock,          layouts: null },
        'divider':          { label: 'Section heading',  group: 'structure', render: renderDividerBlock,        layouts: null },
        'rule':             { label: 'Divider line',     group: 'structure', render: renderRuleBlock,           layouts: null },
        'spacer':           { label: 'Spacer',           group: 'structure', render: renderSpacerBlock,         layouts: null, sizes: ['sm', 'md', 'lg', 'xl'] },
        'columns':          { label: 'Columns',          group: 'structure', render: renderColumnsBlock,        layouts: null, cols: [2, 3] }
    };

    const GROUP_ORDER = [
        { id: 'basic',     label: 'Basic' },
        { id: 'media',     label: 'Media' },
        { id: 'structure', label: 'Structure' }
    ];

    function renderBlock(block, container) {
        const def = BLOCK_REGISTRY[block.type];
        if (!def) return null;
        const node = def.render(block);
        if (node && container) node.dataset.containerUid = container.uid;
        return node;
    }

    /* ---------------------------------------------------------------------------
       BLOCK DECORATION — drag handle, controls, drop targets (edit mode only)
       --------------------------------------------------------------------------- */

    function numberOrNull(value) {
        if (value === '' || value == null) return null;
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    }

    function setNumericOverride(block, field, value) {
        const n = numberOrNull(value);
        if (n == null) delete block[field];
        else block[field] = n;
    }

    function hasNumericOverride(block, field) {
        return Number.isFinite(Number(block && block[field]));
    }

    function applyBlockOverrides(node, block) {
        if (hasNumericOverride(block, 'spaceBefore')) {
            node.style.marginTop = `${Math.max(0, Number(block.spaceBefore))}px`;
        }
        if (hasNumericOverride(block, 'spaceAfter')) {
            node.style.marginBottom = `${Math.max(0, Number(block.spaceAfter))}px`;
        }
        if (hasNumericOverride(block, 'mediaHeight')) {
            node.classList.add('cs-block--media-height-custom');
            node.style.setProperty('--cs-media-height-custom', `${Math.max(80, Number(block.mediaHeight))}px`);
        }
    }

    function toolbarNumber(label, title, value, placeholder, onChange) {
        const wrap = el('label', { class: 'cs-block-toolbar__number', attrs: { title } });
        wrap.appendChild(el('span', { text: label }));
        const input = el('input', {
            attrs: {
                type: 'number',
                min: '0',
                max: '1200',
                step: '4',
                value: value == null ? '' : String(value),
                placeholder
            }
        });
        input.addEventListener('click', (ev) => ev.stopPropagation());
        input.addEventListener('change', () => onChange(input.value));
        wrap.appendChild(input);
        return wrap;
    }

    function decorateBlock(node, block) {
        // Apply per-block spacing in any mode (view + edit).
        const spacing = block.spacing || 'default';
        node.classList.add(`cs-block--gap-${spacing}`);
        applyBlockOverrides(node, block);

        if (mode !== 'edit') return;
        const def = BLOCK_REGISTRY[block.type];
        const blockIsEmpty = isEmptyBlock(block);
        if (blockIsEmpty) {
            node.classList.add('cs-block--empty');
            const emptyDelete = el('button', {
                class: 'cs-empty-block-delete',
                attrs: { type: 'button', contenteditable: 'false', title: 'Delete empty block' },
                text: 'Delete empty block'
            });
            emptyDelete.addEventListener('click', (ev) => {
                ev.stopPropagation();
                removeBlock(block.uid);
            });
            node.appendChild(emptyDelete);
        }

        const toolbar = el('div', { class: 'cs-block-toolbar', attrs: { contenteditable: 'false' } });

        const drag = el('button', { class: 'cs-block-toolbar__btn cs-block-toolbar__drag', attrs: { type: 'button', title: 'Drag to reorder', draggable: 'true' }, html: '⋮⋮' });
        toolbar.appendChild(drag);

        // Layout (image grid columns)
        if (def && def.layouts) {
            const sel = el('select', { class: 'cs-block-toolbar__select', attrs: { title: 'Layout' } });
            def.layouts.forEach((l) => {
                const opt = el('option', { attrs: { value: l }, text: l });
                if ((block.layout || def.layouts[0]) === l) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => {
                block.layout = sel.value;
                if (block.type === 'image') block.items = null;
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(sel);
        }

        // Style (metrics variant)
        if (def && def.styles) {
            const sel = el('select', { class: 'cs-block-toolbar__select', attrs: { title: 'Style' } });
            def.styles.forEach((s) => {
                const opt = el('option', { attrs: { value: s }, text: s });
                if ((block.style || def.styles[0]) === s) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => {
                block.style = sel.value;
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(sel);
        }

        // Spacer size
        if (def && def.sizes) {
            const sel = el('select', { class: 'cs-block-toolbar__select', attrs: { title: 'Size' } });
            def.sizes.forEach((s) => {
                const opt = el('option', { attrs: { value: s }, text: s.toUpperCase() });
                if ((block.size || def.sizes[1] || def.sizes[0]) === s) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => {
                block.size = sel.value;
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(sel);
        }

        // Columns count
        if (def && def.cols) {
            const sel = el('select', { class: 'cs-block-toolbar__select', attrs: { title: 'Columns' } });
            def.cols.forEach((c) => {
                const opt = el('option', { attrs: { value: String(c) }, text: `${c} cols` });
                if ((block.cols || def.cols[0]) === c) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => {
                const newCols = parseInt(sel.value, 10);
                block.cols = newCols;
                // Preserve existing columns; truncate or extend.
                const existing = block.columns || [];
                if (existing.length > newCols) {
                    // Move overflow column blocks into the last kept column.
                    const overflow = existing.slice(newCols).flatMap(c => c.blocks || []);
                    block.columns = existing.slice(0, newCols);
                    block.columns[newCols - 1].blocks = (block.columns[newCols - 1].blocks || []).concat(overflow);
                } else {
                    block.columns = existing.concat(
                        Array.from({ length: newCols - existing.length }, () => ({ uid: uid(), blocks: [] }))
                    );
                }
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(sel);
        }

        // Swap sides for horizontal blocks
        if (block.type === 'horizontal') {
            const swap = el('button', { class: 'cs-block-toolbar__btn', attrs: { type: 'button', title: 'Swap sides' }, text: '⇄' });
            swap.addEventListener('click', () => {
                block.reverse = !block.reverse;
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(swap);
        }

        toolbar.appendChild(toolbarNumber('T', 'Custom spacing above this block in pixels', block.spaceBefore, 'top', (value) => {
            setNumericOverride(block, 'spaceBefore', value);
            schedulePersist();
            renderAll();
        }));

        toolbar.appendChild(toolbarNumber('B', 'Custom spacing below this block in pixels', block.spaceAfter, 'bot', (value) => {
            setNumericOverride(block, 'spaceAfter', value);
            schedulePersist();
            renderAll();
        }));

        if (['image', 'video', 'bento', 'horizontal', 'comparison'].includes(block.type)) {
            toolbar.appendChild(toolbarNumber('H', 'Custom media container height in pixels', block.mediaHeight, 'height', (value) => {
                setNumericOverride(block, 'mediaHeight', value);
                schedulePersist();
                renderAll();
            }));
        }

        if (['image', 'bento'].includes(block.type)) {
            const captionToggle = el('button', {
                class: `cs-block-toolbar__btn cs-block-toolbar__btn--caption${block.hideCaptions ? '' : ' is-active'}`,
                attrs: { type: 'button', title: block.hideCaptions ? 'Show captions' : 'Hide captions' },
                text: 'Cap'
            });
            captionToggle.addEventListener('click', () => {
                block.hideCaptions = !block.hideCaptions;
                schedulePersist();
                renderAll();
            });
            toolbar.appendChild(captionToggle);
        }

        // Universal: per-block spacing (margin below). Notion equivalent of
        // pressing Enter a few extra times to add breathing room.
        const gapSel = el('select', { class: 'cs-block-toolbar__select', attrs: { title: 'Spacing after this block' } });
        [
            { v: 'tight',   t: '↕ Tight' },
            { v: 'default', t: '↕ Default' },
            { v: 'loose',   t: '↕ Loose' },
            { v: 'xl',      t: '↕ XL' }
        ].forEach(({ v, t }) => {
            const opt = el('option', { attrs: { value: v }, text: t });
            if ((block.spacing || 'default') === v) opt.selected = true;
            gapSel.appendChild(opt);
        });
        gapSel.addEventListener('change', () => {
            block.spacing = gapSel.value;
            schedulePersist();
            renderAll();
        });
        toolbar.appendChild(gapSel);

        const del = el('button', { class: 'cs-block-toolbar__btn cs-block-toolbar__delete', attrs: { type: 'button', title: 'Delete block' }, text: '×' });
        del.addEventListener('click', () => {
            removeBlock(block.uid);
        });
        toolbar.appendChild(del);

        node.appendChild(toolbar);
        node.classList.add('cs-block--editable');
        node.dataset.dropZone = 'block';

        // Drag and drop reordering
        drag.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/cs-block-uid', block.uid);
            node.classList.add('is-dragging');
        });
        drag.addEventListener('dragend', () => node.classList.remove('is-dragging'));

        node.addEventListener('dragover', (ev) => {
            const types = ev.dataTransfer && ev.dataTransfer.types;
            if (!types || !Array.from(types).includes('text/cs-block-uid')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            const rect = node.getBoundingClientRect();
            const before = (ev.clientY - rect.top) < rect.height / 2;
            node.classList.toggle('is-drop-before', before);
            node.classList.toggle('is-drop-after', !before);
        });
        node.addEventListener('dragleave', () => {
            node.classList.remove('is-drop-before', 'is-drop-after');
        });
        node.addEventListener('drop', (ev) => {
            const id = ev.dataTransfer.getData('text/cs-block-uid');
            if (!id || id === block.uid) {
                node.classList.remove('is-drop-before', 'is-drop-after');
                return;
            }
            ev.preventDefault();
            const before = node.classList.contains('is-drop-before');
            node.classList.remove('is-drop-before', 'is-drop-after');
            moveBlock(id, block.uid, before ? 'before' : 'after');
        });
    }

    function isBlank(value) {
        return String(value || '').trim().length === 0;
    }

    function isEmptyMedia(value) {
        return !value || isBlank(value.src);
    }

    function isEmptyBlock(block) {
        if (!block || typeof block !== 'object') return true;
        switch (block.type) {
            case 'text':
                return isBlank(block.body);
            case 'section-label':
                return isBlank(block.label);
            case 'eyebrow-heading':
                return isBlank(block.eyebrow) && isBlank(block.headline);
            case 'impact':
                return isBlank(block.headline) && isBlank(block.body);
            case 'numbered':
                return isBlank(block.index) && isBlank(block.headline) && isBlank(block.body);
            case 'pullquote':
                return isBlank(block.body);
            case 'image':
                return isBlank(block.src)
                    && isBlank(block.caption)
                    && (!Array.isArray(block.items) || block.items.every(isEmptyMedia));
            case 'video':
                return isBlank(block.src) && isBlank(block.caption);
            case 'horizontal':
                return isBlank(block.headline) && isBlank(block.text) && isEmptyMedia(block.media);
            case 'comparison':
                return isBlank(block.beforeSrc) && isBlank(block.afterSrc) && isBlank(block.caption);
            case 'bento':
                return !Array.isArray(block.items) || block.items.every(isEmptyMedia);
            case 'metrics':
                return !Array.isArray(block.items)
                    || block.items.every((item) => isBlank(item.stat) && isBlank(item.label) && isBlank(item.note));
            case 'columns':
                return !Array.isArray(block.columns)
                    || block.columns.every((col) => !Array.isArray(col.blocks) || col.blocks.every(isEmptyBlock));
            default:
                return false;
        }
    }

    /* ---------------------------------------------------------------------------
       BLOCK MUTATIONS
       --------------------------------------------------------------------------- */

    /* Recursive helpers that treat both sections and column-blocks as
       block containers. A container is anything with a .blocks[] array;
       a columns block also exposes .columns[], each with its own .blocks[]. */

    function eachContainer(callback) {
        // Visits every container exactly once. Returns first truthy value.
        for (const s of doc.sections) {
            const r = callback(s);
            if (r) return r;
            const inner = walkColumnsIn(s, callback);
            if (inner) return inner;
        }
        return null;
    }

    function walkColumnsIn(container, callback) {
        for (const b of (container.blocks || [])) {
            if (b.type === 'columns') {
                for (const col of (b.columns || [])) {
                    const r = callback(col);
                    if (r) return r;
                    const deeper = walkColumnsIn(col, callback);
                    if (deeper) return deeper;
                }
            }
        }
        return null;
    }

    function findContainer(containerUid) {
        return eachContainer((c) => c.uid === containerUid ? c : null);
    }

    function findBlock(blockUid) {
        return eachContainer((c) => {
            const i = (c.blocks || []).findIndex(b => b.uid === blockUid);
            if (i !== -1) return { container: c, idx: i, block: c.blocks[i] };
            return null;
        });
    }

    function removeBlock(blockUid) {
        const hit = findBlock(blockUid);
        if (!hit) return;
        hit.container.blocks.splice(hit.idx, 1);
        schedulePersist();
        renderAll();
    }

    function removeEmptyBlocksFromContainer(container) {
        if (!container || !Array.isArray(container.blocks)) return 0;
        let removed = 0;

        container.blocks.forEach((block) => {
            if (block.type === 'columns' && Array.isArray(block.columns)) {
                block.columns.forEach((col) => {
                    removed += removeEmptyBlocksFromContainer(col);
                });
            }
        });

        const before = container.blocks.length;
        container.blocks = container.blocks.filter((block) => !isEmptyBlock(block));
        removed += before - container.blocks.length;
        return removed;
    }

    function removeAllEmptyBlocks() {
        let removed = 0;
        (doc.sections || []).forEach((section) => {
            removed += removeEmptyBlocksFromContainer(section);
        });
        if (!removed) {
            flashSaved('No empty blocks');
            return;
        }
        schedulePersist();
        renderAll();
        flashSaved(`Removed ${removed}`);
    }

    function moveBlock(sourceUid, targetUid, where) {
        const src = findBlock(sourceUid);
        const tgt = findBlock(targetUid);
        if (!src || !tgt) return;
        // Don't allow dropping a columns block into one of its own descendants.
        if (src.block.type === 'columns' && isDescendantContainer(src.block, tgt.container.uid)) return;
        const [removed] = src.container.blocks.splice(src.idx, 1);
        const tgt2 = findBlock(targetUid);
        if (!tgt2) {
            // target was inside the moved subtree; bail.
            src.container.blocks.splice(src.idx, 0, removed);
            return;
        }
        const insertAt = where === 'before' ? tgt2.idx : tgt2.idx + 1;
        tgt2.container.blocks.splice(insertAt, 0, removed);
        schedulePersist();
        renderAll();
    }

    function isDescendantContainer(columnsBlock, containerUid) {
        for (const col of (columnsBlock.columns || [])) {
            if (col.uid === containerUid) return true;
            for (const child of (col.blocks || [])) {
                if (child.type === 'columns' && isDescendantContainer(child, containerUid)) return true;
            }
        }
        return false;
    }

    function insertBlock(type, afterUid /* or null = append */, containerUid) {
        const base = makeDefaultBlock(type);
        if (afterUid) {
            const hit = findBlock(afterUid);
            if (hit) {
                hit.container.blocks.splice(hit.idx + 1, 0, base);
                schedulePersist();
                renderAll();
                return;
            }
        }
        const container = (containerUid && findContainer(containerUid)) || doc.sections[doc.sections.length - 1];
        if (!container) {
            doc.sections.push({ uid: uid(), id: 'section', label: 'Section', blocks: [base] });
        } else {
            container.blocks = container.blocks || [];
            container.blocks.push(base);
        }
        schedulePersist();
        renderAll();
    }

    function makeDefaultBlock(type) {
        const base = { uid: uid(), type };
        switch (type) {
            case 'text': base.body = ''; break;
            case 'section-label': base.label = ''; break;
            case 'meta': break;
            case 'eyebrow-heading': base.eyebrow = ''; base.headline = ''; break;
            case 'impact': base.headline = ''; base.body = ''; break;
            case 'numbered': base.index = '01'; base.headline = ''; base.body = ''; break;
            case 'pullquote': base.body = ''; break;
            case 'image': base.layout = 'fullbleed'; base.src = ''; base.alt = ''; break;
            case 'video': base.src = ''; base.alt = ''; break;
            case 'horizontal': base.text = ''; base.media = { type: 'video', src: '', alt: '', device: 'phone', uid: uid() }; break;
            case 'comparison': base.beforeSrc = ''; base.afterSrc = ''; base.labels = { before: 'Before', after: 'After' }; break;
            case 'metrics': base.style = 'standard'; base.items = [{ uid: uid(), stat: '', label: '', note: '' }]; break;
            case 'divider': base.label = 'New section'; base.id = 'new-section'; break;
            case 'rule': break;
            case 'spacer': base.size = 'md'; break;
            case 'columns': base.cols = 2; base.columns = [
                { uid: uid(), blocks: [] },
                { uid: uid(), blocks: [] }
            ]; break;
        }
        return base;
    }

    /* ---------------------------------------------------------------------------
       INSERTER ROW (+) between blocks
       --------------------------------------------------------------------------- */

    function renderInserter(afterUid, containerUid) {
        if (mode !== 'edit') return null;
        const row = el('div', { class: 'cs-inserter', attrs: { contenteditable: 'false' } });

        const trigger = el('button', { class: 'cs-inserter__trigger', attrs: { type: 'button', title: 'Insert block' }, text: '+' });
        const menu = el('div', { class: 'cs-inserter__menu', attrs: { hidden: true } });

        GROUP_ORDER.forEach(({ id: groupId, label: groupLabel }) => {
            const items = Object.entries(BLOCK_REGISTRY).filter(([, def]) => def.group === groupId);
            if (!items.length) return;
            const group = el('div', { class: 'cs-inserter__group' });
            group.appendChild(el('div', { class: 'cs-inserter__group-label', text: groupLabel }));
            const grid = el('div', { class: 'cs-inserter__group-items' });
            items.forEach(([type, def]) => {
                const item = el('button', { class: 'cs-inserter__item', attrs: { type: 'button' }, text: def.label });
                item.addEventListener('click', () => {
                    insertBlock(type, afterUid, containerUid);
                });
                grid.appendChild(item);
            });
            group.appendChild(grid);
            menu.appendChild(group);
        });

        trigger.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
            else menu.setAttribute('hidden', '');
        });

        document.addEventListener('click', (ev) => {
            if (!row.contains(ev.target)) menu.setAttribute('hidden', '');
        });

        row.appendChild(trigger);
        row.appendChild(menu);
        return row;
    }

    /* ---------------------------------------------------------------------------
       SECTION + DOCUMENT RENDERING
       --------------------------------------------------------------------------- */

    function renderSection(section) {
        // Sections no longer render their own visible label — use a Section
        // heading (divider) block at the top of a section when you want one
        // visible. The section element is still useful as a grouping
        // container so blocks know which list they belong to.
        const node = el('section', { class: 'cs-section', attrs: { id: sectionIdFor(section) } });
        node.dataset.sectionUid = section.uid;

        (section.blocks || []).forEach((block) => {
            const blockEl = renderBlock(block, { uid: section.uid });
            if (!blockEl) return;
            node.appendChild(blockEl);
            const ins = renderInserter(block.uid, section.uid);
            if (ins) node.appendChild(ins);
        });

        if (mode === 'edit' && (!section.blocks || section.blocks.length === 0)) {
            const ins = renderInserter(null, section.uid);
            if (ins) node.appendChild(ins);
        }

        return node;
    }

    function renderIndex(sections) {
        const nav = el('nav', { class: 'cs-index', attrs: { 'aria-label': 'Case study sections' } });
        sections.forEach((section) => {
            const a = el('a', {
                class: 'cs-index__link',
                attrs: { href: `#${sectionIdFor(section)}`, 'data-target': sectionIdFor(section) },
                text: section.indexLabel || section.label || section.id || ''
            });
            nav.appendChild(a);
        });
        return nav;
    }

    function updateIndexActive() {
        indexRaf = 0;
        if (!isIndexedCaseStudy()) return;
        const sections = [...document.querySelectorAll('.cs-body-layout--indexed .cs-section')];
        const links = [...document.querySelectorAll('.cs-body-layout--indexed .cs-index__link')];
        if (!sections.length || !links.length) return;

        const probeY = Math.min(window.innerHeight * 0.42, 320);
        let active = sections[0];
        sections.forEach((section) => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= probeY) active = section;
        });

        if (active.id === activeIndexTarget) return;
        activeIndexTarget = active.id;

        const reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const canAnimate = typeof gsap !== 'undefined' && !reduceMotion;

        links.forEach((link) => {
            const isActive = link.dataset.target === active.id;
            link.classList.toggle('is-active', isActive);
            if (isActive) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');

            if (canAnimate) {
                gsap.to(link, {
                    x: isActive ? 18 : 0,
                    duration: isActive ? 0.62 : 0.42,
                    ease: isActive ? 'elastic.out(1, 0.55)' : 'power3.out',
                    overwrite: 'auto'
                });
            } else {
                link.style.transform = isActive ? 'translateX(18px)' : '';
            }
        });
    }

    function requestIndexActiveUpdate() {
        if (indexRaf) return;
        indexRaf = requestAnimationFrame(updateIndexActive);
    }

    function isIndexedCaseStudy() {
        return INDEXED_CASE_STUDIES.has(CASE_ID);
    }

    function indexedLayoutClass() {
        return CASE_ID === 'zapp-account'
            ? 'cs-body-layout cs-body-layout--indexed cs-body-layout--zapp'
            : 'cs-body-layout cs-body-layout--indexed cs-body-layout--growth';
    }

    function renderHero() {
        const wrap = document.querySelector('.cs-page-hero, .pajelly-cs-hero-img');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!doc.hero) doc.hero = { type: 'image', src: '', alt: '' };
        if (!doc.hero.uid) doc.hero.uid = uid();
        const slot = mediaSlot(doc.hero, 'src', 'alt', { priority: 'hero' });
        slot.classList.add('cs-editor-media-slot--hero');
        wrap.appendChild(slot);
    }

    /* Header: editable title + subtitle + 4-col meta row (Role / Timeline / Team / Platform). */
    function renderHeader() {
        const titleEl = document.querySelector('.cs-page-header__title, .pajelly-title');
        const subEl = document.querySelector('.cs-page-header__subtitle, .pajelly-subtitle');
        if (titleEl) {
            titleEl.textContent = '';
            titleEl.dataset.placeholder = 'Case study title';
            applyEditable(titleEl, doc, 'title', doc.title || '');
        }
        if (subEl) {
            subEl.textContent = '';
            subEl.dataset.placeholder = 'One-line summary';
            applyEditable(subEl, doc, 'subtitle', doc.subtitle || '');
        }
        const t = document.querySelector('title');
        if (t) t.textContent = `Case Study | ${doc.title || ''}`;
        renderMetaRow();
    }

    function renderMetaRow() {
        const wrap = document.querySelector('[data-meta-row]');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (isIndexedCaseStudy()) return;
        if (!Array.isArray(doc.meta)) doc.meta = defaultMeta();

        doc.meta.forEach((cell, i) => {
            const item = el('div', { class: 'cs-meta-cell', dataset: { metaIdx: i } });

            const dt = el('dt', { class: 'cs-meta-cell__label' });
            dt.dataset.placeholder = 'Label';
            applyEditable(dt, cell, 'label', cell.label || '');

            const dd = el('dd', { class: 'cs-meta-cell__value' });
            dd.dataset.placeholder = 'Value';
            applyEditable(dd, cell, 'value', cell.value || '');

            item.appendChild(dt);
            item.appendChild(dd);

            if (mode === 'edit') {
                const rm = el('button', { class: 'cs-meta-cell__remove', attrs: { type: 'button', title: 'Remove meta cell' }, text: '×' });
                rm.addEventListener('click', () => {
                    doc.meta.splice(i, 1);
                    schedulePersist();
                    renderAll();
                });
                item.appendChild(rm);
            }
            wrap.appendChild(item);
        });

        if (mode === 'edit') {
            const add = el('button', { class: 'cs-meta-cell cs-meta-cell--add', attrs: { type: 'button' }, text: '+ Add meta' });
            add.addEventListener('click', () => {
                doc.meta.push({ key: 'custom-' + doc.meta.length, label: 'Label', value: '' });
                schedulePersist();
                renderAll();
            });
            wrap.appendChild(add);
        }
    }

    function renderContent() {
        const content = document.querySelector('.cs-content');
        if (!content) return;

        // Wipe existing managed nodes (keep CTA row only)
        [...content.querySelectorAll(':scope > .cs-body-layout, :scope > .cs-section, :scope > .cs-credits, :scope > .cs-callout, :scope > .cs-stats, :scope > .pajelly-cs-grid, :scope > .cs-inserter')].forEach(n => n.remove());

        const cta = content.querySelector('.cs-cta-row');
        if (isIndexedCaseStudy()) {
            const layout = el('div', { class: indexedLayoutClass() });
            const sectionWrap = el('div', { class: 'cs-body-layout__content' });
            layout.appendChild(renderIndex(doc.sections));
            doc.sections.forEach((section) => {
                sectionWrap.appendChild(renderSection(section));
            });
            layout.appendChild(sectionWrap);
            if (cta) content.insertBefore(layout, cta);
            else content.appendChild(layout);
            return;
        }

        doc.sections.forEach((section) => {
            const node = renderSection(section);
            if (cta) content.insertBefore(node, cta);
            else content.appendChild(node);
        });

        if (mode === 'edit') {
            const addSection = el('button', { class: 'cs-inserter cs-inserter--section', attrs: { type: 'button' }, text: '+ Add section' });
            addSection.addEventListener('click', () => {
                doc.sections.push({ uid: uid(), id: 'section-' + (doc.sections.length + 1), label: '', blocks: [] });
                schedulePersist();
                renderAll();
            });
            if (cta) content.insertBefore(addSection, cta);
            else content.appendChild(addSection);
        }
    }

    function renderAll() {
        document.documentElement.dataset.csMode = mode;
        renderHeader();
        renderHero();
        renderContent();
        updateToolbar();
        activeIndexTarget = '';
        requestIndexActiveUpdate();
    }

    /* ---------------------------------------------------------------------------
       TOOLBAR
       --------------------------------------------------------------------------- */

    function buildToolbar() {
        if (document.querySelector('.cs-editor-toolbar')) return;
        const bar = el('div', { class: 'cs-editor-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Case study editor' } });

        const modeBtn = el('button', { class: 'cs-editor-toolbar__btn cs-editor-toolbar__mode', attrs: { type: 'button' } });
        modeBtn.addEventListener('click', () => {
            if (mode === 'edit' && saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
                persist();
            }
            mode = mode === 'edit' ? 'view' : 'edit';
            sessionStorage.setItem(`cs-editor-mode:${CASE_ID}`, mode);
            renderAll();
        });

        const publish = el('button', { class: 'cs-editor-toolbar__btn', attrs: { type: 'button', title: 'Download a JSON snapshot to commit' }, text: 'Publish' });
        publish.addEventListener('click', () => {
            persist();
            try { localStorage.setItem(PUBLISHED_KEY, JSON.stringify(doc)); } catch (e) {}
            const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `case-study-${CASE_ID}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });

        const importBtn = el('button', { class: 'cs-editor-toolbar__btn', attrs: { type: 'button', title: 'Load a JSON snapshot' }, text: 'Import' });
        importBtn.addEventListener('click', async () => {
            const file = await pickFile('application/json');
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sections)) {
                    doc = parsed;
                    ensureIds(doc);
                    persist();
                    renderAll();
                }
            } catch (e) { /* ignore */ }
        });

        const cleanEmpty = el('button', { class: 'cs-editor-toolbar__btn cs-editor-toolbar__btn--wide', attrs: { type: 'button', title: 'Delete all empty blocks' }, text: 'Clean empty' });
        cleanEmpty.addEventListener('click', () => {
            removeAllEmptyBlocks();
        });

        const reset = el('button', { class: 'cs-editor-toolbar__btn cs-editor-toolbar__btn--danger', attrs: { type: 'button', title: 'Discard local edits and revert to the default content' }, text: 'Reset' });
        reset.addEventListener('click', async () => {
            if (!confirm('Discard all local edits for this case study?')) return;
            localStorage.removeItem(STORAGE_KEY);
            doc = await loadBundledDoc();
            applyLocalCaseStudyAssetDefaults(doc);
            ensureGrowthOfferDiscoverySection(doc);
            renderAll();
        });

        const status = el('span', { class: 'cs-editor-toolbar__status', dataset: { state: 'idle' } });

        bar.appendChild(modeBtn);
        bar.appendChild(publish);
        bar.appendChild(importBtn);
        bar.appendChild(cleanEmpty);
        bar.appendChild(reset);
        bar.appendChild(status);
        document.body.appendChild(bar);
    }

    function updateToolbar() {
        const modeBtn = document.querySelector('.cs-editor-toolbar__mode');
        if (modeBtn) modeBtn.textContent = mode === 'edit' ? 'Done editing' : 'Edit page';
        const bar = document.querySelector('.cs-editor-toolbar');
        if (bar) bar.dataset.mode = mode;
    }

    /* ---------------------------------------------------------------------------
       BOOT
       --------------------------------------------------------------------------- */

    async function boot() {
        doc = await resolveDoc();
        applyLocalCaseStudyAssetDefaults(doc);
        ensureGrowthOfferDiscoverySection(doc);
        buildToolbar();
        try {
            if (await migrateInlineMediaAssets()) persist();
        } catch (e) {
            flashSaved('Media migration failed');
        }
        renderAll();
        document.addEventListener('paste', handleMediaPaste);
        document.addEventListener('selectionchange', updateRichTextToolbar);
        if (isIndexedCaseStudy()) {
            window.addEventListener('scroll', requestIndexActiveUpdate, { passive: true });
            window.addEventListener('resize', requestIndexActiveUpdate, { passive: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
