// Run against scripts/preview.cjs. Set PLAYWRIGHT_MODULE if using a bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:4178';
const out = path.resolve(__dirname,'../output/landing-qa');
fs.mkdirSync(out,{recursive:true});
(async()=>{
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
        // Real widget was verified separately; avoid spending its free views in regression runs.
        await browser.contexts()[0].route('https://elfsightcdn.com/**',route=>route.abort());
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        let courtRequests=0;
        page.on('request',request=>{if(request.url().includes('/rest/v1/court?'))courtRequests++;});
        await page.goto(base+'/Pages/Index.html');
        await page.waitForFunction(()=>document.querySelectorAll('.court-card').length===8);
        await page.waitForFunction(()=>document.querySelectorAll('.hero-copy').length===4);
        assert.equal(await page.locator('.google-reviews-link,.map-external-link').count(),0);
        const initialRequests=courtRequests;
        await page.locator('[data-court-id="basketball"]').click();
        await page.waitForSelector('[data-court-viewer][data-open]');
        assert(courtRequests>initialRequests,'Viewer must refetch live courts');
        await page.waitForFunction(()=>{const img=document.querySelector('[data-court-viewer-media] img');return img?.complete&&img.naturalWidth>0;});
        assert.match(await page.locator('[data-court-viewer-media] img').getAttribute('src'),/basketball-1789221827280/);
        assert.match(await page.locator('[data-court-viewer-photo-status]').innerText(),/General Basketball photo/);
        assert.equal(await page.locator('[data-court-viewer-select] option').count(),2);
        assert.equal(await page.locator('[data-court-viewer-media] img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>document.querySelector('[data-court-viewer]').hidden);
        assert(await page.locator('[data-court-id="basketball"]').evaluate(el=>el===document.activeElement));
        await page.locator('[data-court-id="bowling"]').click();
        await page.waitForSelector('[data-court-viewer][data-open]');
        assert.equal(await page.locator('[data-court-viewer-type] option').count(),2);
        assert.equal(await page.locator('[data-court-viewer-select] option').count(),8);
        await page.locator('[data-court-viewer-type]').selectOption('1');
        assert.equal(await page.locator('[data-court-viewer-select] option').count(),12);
        await page.locator('[data-court-viewer-select]').selectOption('11');
        assert.match(await page.locator('[data-court-viewer-book]').innerText(),/Ten-Pin · Lane 12/);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>document.querySelector('[data-court-viewer]').hidden);
        console.log('PASS actual Supabase content, fresh Basketball photo, 8/12 bowling lanes, selection, uncropped media and focus return');
        const partial = await page.evaluate(() => resolveCourtUnits({name:'Bowling — Duckpin',unit:'lanes',quantity:8,imageUrl:'general.jpg',unitImages:[{label:'Lane 3',imageUrl:'specific.jpg'}]}));
        assert.equal(partial.units.length,8);
        assert.equal(partial.units[0].specific,false);
        assert.equal(partial.units[2].imageUrl,'specific.jpg');
        assert.equal(partial.units[2].specific,true);
        assert.equal(await page.evaluate(()=>window.InigoVisuals.venuePhoto('javascript:alert(1)')),null);
        console.log('PASS partial unit photos preserve lane counts and unsafe photo URLs are rejected');

        for(const width of [320,390,768,1024,1440]){
            await page.setViewportSize({width,height:900});
            await page.locator('#location').scrollIntoViewIfNeeded();
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
            assert(await page.locator('body > .site-nav').evaluate(el=>{const r=el.querySelector('.site-nav-pill').getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+20));}),'Navbar obscured at '+width);
            for(const theme of ['light','dark']){
                await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
                const active=page.locator('.site-nav-links a.active').first();
                assert.equal(await active.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
                assert.equal(await page.locator('.site-nav-actions .book-now').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 120, 46)');
            }
        }
        await page.setViewportSize({width:390,height:844});
        await page.getByRole('button',{name:'Open menu',exact:true}).click();
        assert(await page.locator('#landing-mobile-menu').evaluate(el=>!el.inert));
        assert(await page.locator('body > main').evaluate(el=>el.inert));
        await page.keyboard.press('Escape');
        assert(await page.locator('#landing-mobile-menu').evaluate(el=>el.inert));
        await page.getByRole('button',{name:'Open menu',exact:true}).click();
        await page.locator('#landing-mobile-menu [data-auth-open]').click();
        await page.waitForSelector('[data-auth-overlay][data-open]');
        assert(await page.locator('body > main').evaluate(el=>!el.inert));
        await page.locator('[role="tab"][data-auth-tab="signup"]').click();
        assert(await page.locator('[data-auth-panel="signup"]').evaluate(el=>el.classList.contains('is-active')));
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>document.querySelector('[data-auth-overlay]').hidden);
        console.log('PASS navbar on top at five widths, active styling in both themes, orange auth buttons, drawer, login/signup UI');
        await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
        await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
        await page.setViewportSize({width:1440,height:1000});
        await page.locator('#location').scrollIntoViewIfNeeded();
        await page.waitForTimeout(2500);
        await page.locator('.footer-map-canvas').screenshot({path:path.join(out,'map.png')});
        assert.match(await page.locator('.footer-map-frame').getAttribute('src'),/cid=16628664884079723934/);
        assert.match(await page.locator('.map-directions').getAttribute('href'),/destination_place_id=ChIJYWSThmFMvTMRnoWVEJzixOY/);
        for(const file of ['privacy.html','house-rules.html','terms.html']) assert.equal((await page.request.get(base+'/Pages/'+file)).status(),200);
        await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
        await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
        assert.equal(errors.length,0,errors.join('\n'));
        console.log('PASS policy pages, exact map target, zero JavaScript errors');

        // Failures and an empty database must never resurrect demonstration rows.
        const empty=await browser.newPage();
        await empty.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
        await empty.goto(base+'/Pages/Index.html');
        await empty.waitForSelector('.court-grid .content-state');
        assert.equal(await empty.locator('.court-card').count(),0);
        assert.match(await empty.locator('.court-grid').innerText(),/No courts/);
        const failed=await browser.newPage();
        await failed.route('**/rest/v1/**',route=>route.fulfill({status:503,json:{message:'Test outage'}}));
        await failed.goto(base+'/Pages/Index.html');
        await failed.waitForSelector('[data-content-retry="courts"]');
        assert.equal(await failed.locator('.court-card').count(),0);
        await failed.unroute('**/rest/v1/**');
        await failed.locator('[data-content-retry="courts"]').click();
        await failed.waitForSelector('.court-card');
        console.log('PASS empty-state behavior, outage state and retry recovery');
        const animated=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
        await animated.goto(base+'/Pages/Index.html');
        await animated.waitForSelector('.court-card');
        const runtime=await animated.evaluate(()=>({gsap:typeof gsap,scrollTriggers:ScrollTrigger.getAll().length}));
        assert.equal(runtime.gsap,'object');assert(runtime.scrollTriggers>0);
        await animated.emulateMedia({reducedMotion:'reduce'});
        await animated.waitForFunction(()=>ScrollTrigger.getAll().length===0);
        await animated.setViewportSize({width:390,height:844});
        await animated.locator('#location').scrollIntoViewIfNeeded();
        await animated.waitForTimeout(1800);
        await animated.locator('.footer-map-canvas').screenshot({path:path.join(out,'mobile-map.png')});
        await animated.getByRole('button',{name:'Open menu',exact:true}).click();
        await animated.screenshot({path:path.join(out,'mobile-menu.png')});
        console.log('PASS live motion and runtime reduced-motion cleanup');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
