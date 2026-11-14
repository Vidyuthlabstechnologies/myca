import sys
from PIL import Image

path = sys.argv[1]
image = Image.open(path)
if image.mode in ('RGBA', 'LA', 'P'):
    image = image.convert('RGBA')
    flat = Image.new('RGB', image.size, (255, 255, 255))
    flat.paste(image, mask=image.split()[3])
    image = flat
image.save(path, optimize=True)
