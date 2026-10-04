"""Exercise the installed app using Android's accessibility tree and adb.

Run on a test emulator: python3 scripts/android-smoke.py
For Expo Go: python3 scripts/android-smoke.py --package host.exp.exponent --url exp://127.0.0.1:8081
Creates uniquely named test data; deletes only its own note and folder.
"""
import argparse
import datetime
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--package', default='com.quicknote.mobile')
parser.add_argument('--url')
args = parser.parse_args()

def adb(*parts):
    return subprocess.check_output(['adb', *parts], text=True, timeout=30)

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/quicknote-smoke.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/quicknote-smoke.xml'))

def find(label, wait=40):
    until = time.monotonic() + wait
    while time.monotonic() < until:
        root = tree()
        for n in root.iter('node'):
            if n.get('content-desc') == label or n.get('text') == label:
                return n
        time.sleep(.3)
    raise AssertionError(f'Not found: {label}. Visible: ' + str([(n.get('text'), n.get('content-desc')) for n in root.iter('node') if n.get('text') or n.get('content-desc')]))

def tap(label):
    n = find(label)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(.3)

def enter(label, text):
    tap(label)
    adb('shell', 'input', 'text', text)
    time.sleep(.3)

def launch():
    if args.url:
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', args.url, '-p', args.package)
    else:
        adb('shell', 'am', 'start', '-W', '-n', args.package + '/.MainActivity')

stamp = str(int(time.time()))
name = 'Smoke' + stamp
folder = 'Folder' + stamp
launch()
tap('New note')
enter('Note text', name)
adb('shell', 'input', 'keyevent', '4')
find('Saved on this device')
tap('Pin')
find('Unpin')
adb('shell', 'am', 'force-stop', args.package)
launch()
assert find('Note text').get('text') == name, 'Note did not survive restart'
find('Unpin')
print('PASS: save, pin, and process restart', flush=True)
tap('Archive')
find('Restore to edit')
tap('Restore to edit')
find('Pin')
tap('Trash')
find('Restore from Trash')
tap('Restore from Trash')
find('Pin')
print('PASS: archive, trash, and restore', flush=True)
tap('Library')
tap('New folder')
enter('Folder name', folder)
tap('Create folder')
tap('Editor')
tap('Folders')
tap('○ ' + folder)
find('✓ ' + folder)
tap('Done')
tap('Library')
tap(folder + ' (1)')
tap('Delete folder')
find('All active notes in this folder move to Trash, even notes assigned to other folders. Archived notes stay archived. The folder is removed permanently.')
# Android alert button text is uppercased in its accessibility tree.
tap('DELETE FOLDER')
tap('Trash')
tap('Open ' + name)
find('Restore from Trash')
tap('Delete forever')
tap('CANCEL')
find('Restore from Trash')
tap('Delete forever')
tap('DELETE FOREVER')
print('PASS: folder assignment/deletion and permanent deletion confirmation', flush=True)
tap('Menu')
tap('Dark')
find('✓ Dark')
tap('System')
tap('Done')
tap('Calendar')
find('Today')
tap('‹ Previous')
today = datetime.date.today()
previous = today.replace(day=1) - datetime.timedelta(days=1)
past = previous.replace(day=2).isoformat()
tap(past + ', 0 notes')
tap('New note')
find('New note for ' + past)
enter('Note text', name + 'Calendar')
adb('shell', 'input', 'keyevent', '4')
find('Saved on this device')
tap('Trash')
tap('Delete forever')
tap('DELETE FOREVER')
tap('Editor')
enter('Note text', name + 'AfterDelete')
adb('shell', 'input', 'keyevent', '4')
tap('Calendar')
# Deleting a dated note must not give the next blank editor its old date.
find(past + ', 0 notes')
tap('Today')
find(today.isoformat() + ', 1 notes')
tap('Open ' + name + 'AfterDelete')
tap('Trash')
tap('Delete forever')
tap('DELETE FOREVER')
print('PASS: themes, calendar dates, and editor reset after permanent deletion', flush=True)
print('Android smoke test passed.', flush=True)
