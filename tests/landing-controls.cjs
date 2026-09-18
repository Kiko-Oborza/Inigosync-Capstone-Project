// Run against scripts/preview.cjs. Provider data is mocked; no widget views used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4178/Pages/Index.html';
const uuid = '11111111-2222-3333-4444-555555555555';
(async () => {
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        async function setup({count=4, id='', provider='blocked', motion='reduce'}={}) {
            const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:motion});
            await page.route('**/Config/googleReviews.js', route => route.fulfill({contentType:'application/javascript',body:`window.InigoGoogleReviews={widgetId:${JSON.stringify(id)}};`}));
            await page.route('https://elfsightcdn.com/**', route => provider === 'blocked' ? route.abort() : route.fulfill({contentType:'application/javascript',body: provider === 'empty' ? '' : `document.querySelector('.elfsight-app-${uuid}').textContent='Provider fixture: 4.3 stars';`}));
            await page.route('**/rest/v1/**', route => {
                const table = new URL(route.request().url()).pathname.split('/').pop();
                const data = table === 'event' ? Array.from({length:count},(_,i)=>({title:'Feature '+(i+1),meta:'Venue event',tag:'Featured'})) : table === 'testimonial' ? [{author_name:'Test guest',quote:'Testimonial fixture',rating:5}] : [];
                return route.fulfill({json:data});
            });
            await page.goto(base);
            await page.waitForFunction(n => n ? document.querySelectorAll('.hero-copy').length === n && document.querySelector('.hero-title')?.textContent === 'Feature 1' : document.querySelector('.hero-meta')?.textContent.includes('no published events'),count);
            return page;
        }
        const page = await setup();
        const active = () => page.locator('.hero-copy.is-active .hero-title').innerText();
        await page.getByRole('button',{name:'Previous featured event'}).click();
        assert.equal(await active(),'Feature 4');
        await page.getByRole('button',{name:'Next featured event'}).click();
        assert.equal(await active(),'Feature 1');
        await page.getByRole('button',{name:'Show Feature 3',exact:true}).click();
        assert.equal(await active(),'Feature 3');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await active(),'Feature 2');
        await page.getByRole('button',{name:'Next featured event'}).focus();
        await page.keyboard.press('Enter');
        assert.equal(await active(),'Feature 3');
        await page.locator('[data-home-showcase]').evaluate(hero => {
            for (const [type,x] of [['touchstart',180],['touchend',80]]) {
                const event = new Event(type); Object.defineProperty(event,'changedTouches',{value:[{clientX:x,clientY:100}]}); hero.dispatchEvent(event);
            }
        });
        assert.equal(await active(),'Feature 4');
        assert(await page.locator('[data-home-pause]').isDisabled());
        assert(await page.locator('[data-testimonial-grid]').isVisible());
        assert(await page.locator('[data-google-reviews]').isHidden());
        assert.equal(await page.locator('script[src*="elfsightcdn"]').count(),0);
        for (const width of [320,390,768,1024,1440]) {
            await page.setViewportSize({width,height:900});
            await page.locator('[data-home-next]').scrollIntoViewIfNeeded();
            assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'Overflow at '+width);
            for (const selector of ['[data-home-prev]','[data-home-next]']) {
                assert(await page.locator(selector).evaluate(el=>{
                    const r=el.getBoundingClientRect(),copy=document.querySelector('.hero-copy-wrap').getBoundingClientRect();
                    return r.width>=44 && r.height>=44 && r.top>=copy.bottom && r.left>=0 && r.right<=innerWidth && el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
                }), 'Obscured or overlapping control at '+width);
            }
        }
        await page.screenshot({path:'output/landing-controls-desktop.png'});
        await page.setViewportSize({width:320,height:900});
        await page.locator('[data-home-next]').scrollIntoViewIfNeeded();
        await page.screenshot({path:'output/landing-controls-mobile.png'});
        for (const count of [0,1]) {
            const small=await setup({count});
            assert(await small.locator('[data-home-prev]').isHidden());
            assert(await small.locator('[data-home-next]').isHidden());
            await small.close();
        }
        const animated=await setup({motion:'no-preference'});
        await animated.locator('[data-home-pause]').click();
        assert.equal(await animated.locator('[data-home-pause]').getAttribute('aria-pressed'),'true');
        await animated.locator('[data-home-next]').click();
        assert.equal(await animated.locator('[data-home-pause]').getAttribute('aria-pressed'),'true');
        await animated.locator('[data-home-pause]').click();
        assert.equal(await animated.locator('[data-home-pause]').getAttribute('aria-pressed'),'false');
        await animated.getByRole('link',{name:'Read reviews on Google'}).focus();
        await animated.getByRole('link',{name:'Read reviews on Google'}).hover();
        await animated.waitForFunction(()=>document.querySelector('.hero-copy.is-active .hero-title').textContent==='Feature 3',{},{timeout:8000});
        for (const provider of ['blocked','loaded','empty']) {
            const widget=await setup({id:uuid,provider});
            await widget.locator('.google-reviews-link').scrollIntoViewIfNeeded();
            assert(await widget.getByRole('link',{name:'Read reviews on Google'}).isVisible());
            assert(await widget.locator('[data-testimonial-grid]').isHidden());
            assert(!/not a Google/.test(await widget.locator('[data-testimonial-disclosure]').innerText()));
            if(provider==='loaded') assert.match(await widget.locator('[data-google-reviews]').innerText(),/4.3 stars/);
            if(provider==='blocked') await widget.waitForFunction(()=>document.querySelector('[data-google-reviews-note]').textContent.includes('could not be loaded'));
            await widget.close();
        }
        const invalid=await setup({id:'invalid-id'});
        assert.equal(await invalid.locator('script[src*="elfsightcdn"]').count(),0);
        console.log('PASS arrows, wraparound, dots, keyboard, swipe, autoplay/pause, reduced motion, five widths, zero/one event, configured/missing/invalid widget and provider failure/empty response');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
