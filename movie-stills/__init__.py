import ffmpeg
from random import randrange
import argparse
import sys
from pathlib import Path
import os

parser = argparse.ArgumentParser(description="Summarizes a movie in screenshots.")
parser.add_argument('-f','--file',      type=str,               help="Full path to file to summarize.")
parser.add_argument('-o','--output',    type=str, default='.',  help="Output folder")
parser.add_argument('-s','--step',      type=int, default=120,  help="Time in seconds between screenshots.")
parser.add_argument('-v','--variance',  type=int, default=20,   help="Add or subtract seconds to add randomness.")
parser.add_argument('-w','--width',     type=int, default=640,  help="Width of the output screenshot. Aspect ratio is preserved.")

args = parser.parse_args()

p = Path(args.output)
if not p.exists():
    try:
        p.mkdir(parents=True)
    except PermissionError:
        sys.exit("Error: Output directory does not exist, and can't be created.")
    

try:
    movie_data = ffmpeg.probe(args.file)
except ffmpeg.Error as e:
    print('stdout:', e.stdout.decode('utf8'))
    print('stderr:', e.stderr.decode('utf8'))
    sys.exit()
except KeyError:
    sys.exit(f"Error: Are you sure {args.file} is a valid videofile?")

start_time = 60 * 3 # the first 3 minutes are usually just intros

tail = 60 * 10 # Skip credits 
end_time = int(movie_data['format']['duration'].split('.')[0]) - tail

current_time = 0
count = 0

while True:
    if count == 0:
        current_time = start_time
    else:
        current_time = current_time + (args.step + (randrange(-1, 2) * randrange(1, args.variance)))

    if current_time >= end_time:
        break
    img_file = p / f'img{count}.png'
    try:
        frame = (
            ffmpeg
            .input(args.file, ss=current_time)
            .filter('scale', args.width, -1)
            .output(str(img_file.absolute()), vframes=1, loglevel='warning')
            .run()
            )
    except ffmpeg.Error as e:
        sys.exit()
    count = count + 1