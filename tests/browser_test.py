"""Real-input integration tests. Start `npm run dev` before running this file."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GAME_URL', 'http://127.0.0.1:3000')
ARTIFACTS = Path(os.environ.get('TEST_OUTPUT', '/tmp/lumenfall-tests'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def state(page):
    return page.evaluate('window.gameState')


def advance(page, ms=80):
    page.clock.run_for(ms)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
            headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1100})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install()
        assert page.goto(BASE + '/?test=1').status == 200
        advance(page, 100)
        assert state(page)['mode'] == 'intro'
        page.screenshot(path=str(ARTIFACTS / 'desktop-intro.png'), full_page=True)
        page.get_by_role('button', name='游玩指南').click()
        assert page.get_by_role('dialog').is_visible()
        page.get_by_role('button', name='知道了').click()
        assert state(page)['mode'] == 'intro'
        page.keyboard.press('Enter')
        advance(page, 200)
        assert state(page)['mode'] == 'playing'
        x = state(page)['player']['x']
        page.keyboard.down('d'); advance(page, 400); page.keyboard.up('d')
        assert state(page)['player']['x'] > x + 40
        page.keyboard.press('Space'); advance(page, 200)
        assert state(page)['player']['jumps'] == 1
        assert state(page)['player']['vy'] < 0
        page.keyboard.press('Space'); advance(page, 80)
        assert state(page)['player']['jumps'] == 2
        page.keyboard.press('k'); advance(page, 80)
        assert state(page)['player']['dashCD'] > 0
        assert abs(state(page)['player']['vx']) > 400
        page.keyboard.press('Escape')
        paused = state(page)['player']
        advance(page, 1000)
        assert state(page)['player'] == paused
        page.get_by_role('button', name='继续旅途').click()
        assert state(page)['mode'] == 'playing'
        page.get_by_role('button', name='开启声音').click()
        assert page.get_by_role('button', name='关闭声音').get_attribute('aria-pressed') == 'true'
        page.get_by_role('button', name='关闭声音').click()
        print('PASS: startup, help, movement, double jump, dash, pause, audio', flush=True)

        # Start a clean run; steer with keyboard events, using read-only observations.
        page.keyboard.press('Escape')
        page.get_by_role('button', name='重新出发').click()
        advance(page, 200)
        route = [
            ('crystal', 0), ('crystal', 1), ('land', (710, 363)), ('land', (910, 470)),
            ('crystal', 2), ('crystal', 3), ('land', (1510, 375)), ('land', (1740, 450)),
            ('crystal', 4), ('crystal', 5), ('land', (2260, 367)), ('land', (2410, 468)),
            ('crystal', 6), ('crystal', 7), ('land', (3020, 365)), ('land', (3240, 448)),
            ('crystal', 8), ('crystal', 9), ('land', (3900, 370)), ('land', (4120, 465)),
            ('crystal', 10), ('crystal', 11), ('gate', 0)
        ]
        held = None
        ticks = 0
        for kind, index in route:
            for attempt in range(260):
                s = state(page)
                hero = s['player']
                if s['mode'] == 'won':
                    break
                assert s['mode'] == 'playing', f'Unexpected death at {kind} {index}: {s}'
                if kind == 'crystal':
                    c = s['crystals'][index]
                    if c['taken']:
                        # Let the character land on the platform before the next leap.
                        if held:
                            page.keyboard.up(held); held = None
                        for _ in range(18):
                            if state(page)['player']['grounded']:
                                break
                            advance(page)
                        print(f'  collected {index + 1}/12', flush=True)
                        break
                    target_x, target_y = c['x'] - 9, c['y']
                elif kind == 'land':
                    target_x, floor_y = index
                    target_x -= 9
                    target_y = floor_y - 16
                    if abs(hero['x'] - target_x) < 20 and hero['grounded'] and abs(hero['y'] + 32 - floor_y) < 4:
                        break
                else:
                    target_x, target_y = 4935, 430
                dx = target_x - hero['x']
                desired = 'd' if dx > 9 else 'a' if dx < -9 else None
                if desired != held:
                    if held:
                        page.keyboard.up(held)
                    if desired:
                        page.keyboard.down(desired)
                    held = desired
                below = next((pl for pl in s['platforms']
                              if pl['x'] - 2 <= hero['x'] + 9 <= pl['x'] + pl['w'] + 2
                              and abs(pl['y'] - hero['y'] - 32) < 4), None)
                cliff = below and desired == 'd' and hero['x'] + 55 > below['x'] + below['w']
                nearby = abs(dx) < 190
                if hero['grounded'] and (cliff or nearby and target_y < hero['y'] + 10):
                    page.keyboard.press('Space')
                elif not hero['grounded'] and hero['jumps'] == 1 and hero['vy'] > -70:
                    page.keyboard.press('Space')
                if hero['attackCD'] <= 0:
                    page.keyboard.press('j')
                advance(page)
                ticks += 1
            else:
                page.screenshot(path=str(ARTIFACTS / 'route-failure.png'))
                raise AssertionError(f'Route stalled at {kind} {index}: {state(page)}')
        if held:
            page.keyboard.up(held)
        final = state(page)
        assert final['mode'] == 'won', final
        assert final['score'] == 12
        assert final['checkpoint'] == 2
        page.screenshot(path=str(ARTIFACTS / 'victory.png'))
        print(f"PASS: full level, 12 crystals, both checkpoints, victory ({ticks} steps)", flush=True)
        page.get_by_role('button', name='再走一段旅途').click()
        assert state(page)['score'] == 0
        assert state(page)['player']['health'] == 3

        # Meet the first enemy on the ground and use two deliberate sword strikes.
        advance(page, 200)
        page.keyboard.down('d')
        for _ in range(80):
            s = state(page)
            if s['enemies'][0]['x'] - s['player']['x'] < 65:
                break
            advance(page)
        page.keyboard.up('d')
        for _ in range(20):
            page.keyboard.press('j'); advance(page, 180)
            if state(page)['kills'] > 0:
                break
        assert state(page)['kills'] > 0
        print('PASS: sword combat defeats an enemy', flush=True)

        # No jumping: ground-level collision and falling must eventually show death.
        page.keyboard.down('d')
        for _ in range(700):
            advance(page)
            if state(page)['mode'] == 'dead':
                break
        page.keyboard.up('d')
        assert state(page)['mode'] == 'dead'
        page.get_by_role('button', name='重新点亮').click()
        assert state(page)['mode'] == 'playing'
        assert state(page)['player']['health'] == 3
        print('PASS: death, respawn, new-game reset', flush=True)
        assert not errors, errors
        page.close()

        mobile = browser.new_page(viewport={'width': 390, 'height': 844},
                                  is_mobile=True, has_touch=True, device_scale_factor=1)
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        mobile.clock.install()
        mobile.goto(BASE + '/?test=1'); advance(mobile, 100)
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(ARTIFACTS / 'mobile-intro.png'), full_page=True)
        mobile.get_by_role('button', name='开启旅途').tap()
        advance(mobile, 100)
        assert mobile.get_by_role('button', name='向右').is_visible()
        button = mobile.get_by_role('button', name='向右')
        x = state(mobile)['player']['x']
        box = button.bounding_box()
        mobile.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
        mobile.mouse.down(); advance(mobile, 400); mobile.mouse.up()
        assert state(mobile)['player']['x'] > x + 40
        mobile.get_by_role('button', name='跳跃', exact=True).tap(); advance(mobile, 150)
        assert state(mobile)['player']['jumps'] == 1
        mobile.screenshot(path=str(ARTIFACTS / 'mobile-playing.png'), full_page=True)
        assert not errors, errors
        print('PASS: mobile layout, touch controls, no browser errors', flush=True)
        browser.close()


if __name__ == '__main__':
    run()
