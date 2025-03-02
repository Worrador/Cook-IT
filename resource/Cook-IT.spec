import sys
import os
from PyInstaller.utils.hooks import collect_submodules

# Get paths
current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
source_dir = os.path.join(current_dir, '../source/')

block_cipher = None

# Analyze the script
a = Analysis(
    [os.path.join(source_dir, 'cook_it_bridge.py')],
    pathex=[source_dir],
    binaries=[],
    datas=[
        (os.path.join(source_dir, 'credentials.json'), '.'),
        (os.path.join(source_dir, 'Cook_IT.py'), '.'),
        ('..\\resource\\Cook-IT.ico', 'resource')
    ],
    # Only include what's needed based on imports analysis
    hiddenimports=[
        'google.oauth2.credentials',
        'google_auth_oauthlib.flow',
        'googleapiclient.discovery',
        'googleapiclient.http',
        # Only import pandas modules we actually need
        'pandas.core.frame',
        'pandas.io.excel',
        'pandas.io.formats.excel',
        'openpyxl',
        'numpy.core',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Exclude large unused libraries
    excludes=[
        'matplotlib', 'PyQt5', 'PySide2', 'tkinter', 'PIL',
        'scipy', 'scrapy', 'sphinx', 'sqlalchemy',
        'notebook', 'jedi', 'ipython'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    # Enable tree shaking to remove unused modules
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
    # Exclude files that don't compress well with UPX
    upx_exclude=['vcruntime140.dll', 'python3.dll', 'VCRUNTIME140.dll'],
    console=False,
    windowed=True,
    icon=['.\\Cook-IT.ico'],
    cipher=block_cipher
)