import sys
import os
from PyInstaller.utils.hooks import collect_submodules
import PyInstaller

# Get paths
current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
source_dir = os.path.join(current_dir, '../source/')
python_dir = os.path.dirname(sys.executable)  # Add this to find Python DLLs
block_cipher = None

# Collect Python DLLs based on your Python version
python_dlls = []
for file in os.listdir(python_dir):
    if file.lower().startswith('python3') and file.lower().endswith('.dll'):
        python_dlls.append((os.path.join(python_dir, file), '.'))

# Analyze the script
a = Analysis(
    [os.path.join(source_dir, 'cook_it_bridge.py')],
    pathex=[source_dir, python_dir],  # Add Python dir to path
    binaries=python_dlls,  # Add Python DLLs explicitly
    datas=[
        (os.path.join(source_dir, 'credentials.json'), '.'),
        (os.path.join(source_dir, 'Cook_IT.py'), '.'),
        ('..\\python_resources\\Cook-IT.ico', 'resource')
    ],
    hiddenimports=[
        'google.oauth2.credentials',
        'google_auth_oauthlib.flow',
        'googleapiclient.discovery',
        'googleapiclient.http',
        'google.auth.transport.requests',
        'googleapiclient.errors',
        'google.oauth2.service_account',
        'pandas.core.frame',
        'pandas.io.excel',
        'pandas.io.formats.excel',
        'pandas.io.excel._openpyxl',
        'openpyxl',
        'openpyxl.cell',
        'openpyxl.workbook',
        'numpy.core',
        'io',
        'webbrowser',
        'locale',
        'json',
        'contextlib',
        'queue',
        'threading',
        'socket',
        'random',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib', 'PyQt5', 'PySide2', 'tkinter', 'PIL',
        'scipy', 'scrapy', 'sphinx', 'sqlalchemy',
        'notebook', 'jedi', 'ipython'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    tree_shaking=True
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='Cook-IT',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=True,
    upx_exclude=['vcruntime140.dll', 'python3.dll', 'VCRUNTIME140.dll', 'python312.dll'],  # Added python312.dll
    runtime_tmpdir=None,
    console=False,
    windowed=True,
    icon='..\\python_resources\\Cook-IT.ico',
    cipher=block_cipher,
    onefile=True
)