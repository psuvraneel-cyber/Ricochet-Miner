import os
import subprocess
import wave
import numpy as np

SR = 44100
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "audio")
TMP_DIR = os.path.join(os.path.dirname(__file__), "..", ".tmp_audio")
FFMPEG = os.path.join(os.path.dirname(__file__), "..", "node_modules", "ffmpeg-static", "ffmpeg.exe")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

rng = np.random.default_rng(20261127)


def env_exp(t, attack=0.003, decay=0.15):
    a = np.clip(t / max(attack, 1e-4), 0.0, 1.0)
    return a * np.exp(-t / max(decay, 1e-4))


def one_pole_lp(x, cutoff_hz):
    rc = 1.0 / (2.0 * np.pi * max(cutoff_hz, 20.0))
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y


def one_pole_hp(x, cutoff_hz):
    return x - one_pole_lp(x, cutoff_hz)


def soft_clip(x, drive=1.5):
    return np.tanh(x * drive)


def save_ogg(name, sig, target_peak=0.88):
    # Fade edges cleanly (3ms) to prevent boundary clicks
    fade_n = min(len(sig) // 8, int(SR * 0.003))
    if fade_n > 1:
        sig[:fade_n] *= np.linspace(0.0, 1.0, fade_n)
        sig[-fade_n:] *= np.linspace(1.0, 0.0, fade_n)
    peak = float(np.max(np.abs(sig)))
    if peak > 1e-6:
        sig = sig * (target_peak / peak)
    pcm = np.clip(sig * 32767.0, -32767.0, 32767.0).astype(np.int16)

    wav_path = os.path.join(TMP_DIR, f"{name}.wav")
    ogg_path = os.path.join(OUT_DIR, f"{name}.ogg")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    subprocess.run(
        [FFMPEG, "-y", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "4", ogg_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    os.remove(wav_path)
    kb = os.path.getsize(ogg_path) / 1024.0
    print(f"[SFX] {name}.ogg ({len(sig)/SR:.2f}s, {kb:.1f} KB)")


def make_noise(n):
    return rng.uniform(-1.0, 1.0, n)


def sweep_phase(f0, f1, t, exp_k=None):
    if exp_k is None:
        inst = f0 + (f1 - f0) * (t / max(t[-1], 1e-4))
    else:
        inst = f1 + (f0 - f1) * np.exp(-t * exp_k)
    return 2.0 * np.pi * np.cumsum(inst) / SR


# 1. sfx_launch.ogg: Pneumatic turret clunk + spinning blade air slice
t = np.linspace(0, 0.26, int(SR * 0.26), endpoint=False)
thump = np.sin(sweep_phase(170, 52, t, 28.0)) * env_exp(t, 0.002, 0.055) * 0.9
slice_air = one_pole_hp(one_pole_lp(make_noise(len(t)), 4600), 900) * env_exp(t, 0.01, 0.085) * 0.65
whir = np.sin(sweep_phase(240, 920, t)) * env_exp(t, 0.008, 0.09) * 0.35
save_ogg("sfx_launch", soft_clip(thump + slice_air + whir, 1.4))

# 2. sfx_wall_hit.ogg: Crisp saw-glancing steel/timber deflection
t = np.linspace(0, 0.14, int(SR * 0.14), endpoint=False)
wood_body = np.sin(sweep_phase(310, 125, t, 45.0)) * env_exp(t, 0.001, 0.032) * 0.85
steel_spark = (
    np.sin(2 * np.pi * 1980 * t) * 0.35
    + np.sin(2 * np.pi * 3120 * t) * 0.25
) * env_exp(t, 0.001, 0.028)
scrape = one_pole_hp(one_pole_lp(make_noise(len(t)), 5200), 1400) * env_exp(t, 0.001, 0.025) * 0.45
save_ogg("sfx_wall_hit", soft_clip(wood_body + steel_spark + scrape, 1.5))

# 3. sfx_hit_stone.ogg: Punchy rock chisel crack + deep body thump
t = np.linspace(0, 0.16, int(SR * 0.16), endpoint=False)
punch = np.sin(sweep_phase(195, 62, t, 42.0)) * env_exp(t, 0.001, 0.045) * 0.95
crack = one_pole_lp(one_pole_hp(make_noise(len(t)), 650), 3400) * env_exp(t, 0.001, 0.04) * 0.9
grit = one_pole_lp(make_noise(len(t)), 1400) * env_exp(t, 0.005, 0.07) * 0.35
save_ogg("sfx_hit_stone", soft_clip(punch + crack + grit, 1.6))

# 4. sfx_hit_granite.ogg: Heavy dense basalt impact + metallic modal clang
t = np.linspace(0, 0.21, int(SR * 0.21), endpoint=False)
heavy_thud = np.sin(sweep_phase(145, 48, t, 32.0)) * env_exp(t, 0.001, 0.055) * 0.9
clang = (
    np.sin(2 * np.pi * 790 * t) * 0.42
    + np.sin(2 * np.pi * 1245 * t) * 0.32
    + np.sin(2 * np.pi * 2130 * t) * 0.22
) * env_exp(t, 0.001, 0.085)
ring_noise = one_pole_hp(one_pole_lp(make_noise(len(t)), 4200), 1100) * env_exp(t, 0.001, 0.035) * 0.65
save_ogg("sfx_hit_granite", soft_clip(heavy_thud + clang + ring_noise, 1.5))

# 5. sfx_hit_ore.ogg: Warm gold/gemstone chime + crisp stone tap
t = np.linspace(0, 0.22, int(SR * 0.22), endpoint=False)
tap = np.sin(sweep_phase(230, 80, t, 40.0)) * env_exp(t, 0.001, 0.035) * 0.55
chime = (
    np.sin(2 * np.pi * 1046.5 * t) * 0.45
    + np.sin(2 * np.pi * 1567.98 * t) * 0.35
    + np.sin(2 * np.pi * 2637.0 * t) * 0.18
) * env_exp(t, 0.002, 0.09)
sparkle = one_pole_hp(make_noise(len(t)), 3500) * env_exp(t, 0.001, 0.02) * 0.3
save_ogg("sfx_hit_ore", soft_clip(tap + chime + sparkle, 1.2))

# 6. sfx_hit_frost.ogg: Brittle crystalline ice fracture + shimmer tail
t = np.linspace(0, 0.24, int(SR * 0.24), endpoint=False)
crunch = one_pole_hp(one_pole_lp(make_noise(len(t)), 7200), 2200) * env_exp(t, 0.001, 0.055) * 0.75
shard1 = np.sin(2 * np.pi * 2480 * t) * env_exp(t, 0.001, 0.08) * 0.38
shard2 = np.sin(2 * np.pi * 3720 * t) * env_exp(np.maximum(0, t - 0.015), 0.001, 0.09) * 0.30
sub_ice = np.sin(sweep_phase(280, 95, t, 35.0)) * env_exp(t, 0.001, 0.04) * 0.45
save_ogg("sfx_hit_frost", soft_clip(crunch + shard1 + shard2 + sub_ice, 1.3))

# 7. sfx_break_rock.ogg: Shatter snap + hollow punch + tumbling rubble cascade
t = np.linspace(0, 0.35, int(SR * 0.35), endpoint=False)
snap = one_pole_lp(one_pole_hp(make_noise(len(t)), 450), 4200) * env_exp(t, 0.001, 0.05) * 1.1
low = np.sin(sweep_phase(135, 42, t, 22.0)) * env_exp(t, 0.002, 0.085) * 0.95
pebbles = np.zeros_like(t)
for offset in [0.035, 0.075, 0.115, 0.165, 0.22]:
    mask = t >= offset
    dt_p = t[mask] - offset
    f_p = rng.uniform(450, 1450)
    peb = (
        one_pole_lp(make_noise(len(dt_p)), f_p * 1.4) * 0.6
        + np.sin(2 * np.pi * f_p * dt_p) * 0.3
    ) * env_exp(dt_p, 0.001, 0.03) * rng.uniform(0.25, 0.55)
    pebbles[mask] += peb
save_ogg("sfx_break_rock", soft_clip(snap + low + pebbles, 1.5))

# 8. sfx_bumper.ogg: Solenoid mechanical thwack + FM pinball bell bounce
t = np.linspace(0, 0.24, int(SR * 0.24), endpoint=False)
thwack = np.sin(sweep_phase(340, 120, t, 50.0)) * env_exp(t, 0.001, 0.035) * 0.8
fm_mod = np.sin(2 * np.pi * 587.33 * t) * 2.4 * np.exp(-t * 18.0)
bell = np.sin(2 * np.pi * 880.0 * t + fm_mod) * env_exp(t, 0.002, 0.11) * 0.75
bell2 = np.sin(2 * np.pi * 1318.51 * t) * env_exp(t, 0.005, 0.12) * 0.45
save_ogg("sfx_bumper", soft_clip(thwack + bell + bell2, 1.3))

# 9. sfx_tnt_explosion.ogg: Chest sub drop + crack blast + roaring cavern tail + debris
t = np.linspace(0, 0.72, int(SR * 0.72), endpoint=False)
sub_boom = np.sin(sweep_phase(125, 24, t, 14.0)) * env_exp(t, 0.002, 0.28) * 1.3
crack_transient = one_pole_hp(make_noise(len(t)), 900) * env_exp(t, 0.001, 0.038) * 1.25
fire_roar = one_pole_lp(make_noise(len(t)), 780) * env_exp(t, 0.006, 0.25) * 1.15
sub_rubble = one_pole_lp(make_noise(len(t)), 240) * env_exp(t, 0.03, 0.34) * 0.85
debris = np.zeros_like(t)
for offset in [0.14, 0.21, 0.28, 0.36, 0.45]:
    mask = t >= offset
    dt_p = t[mask] - offset
    debris[mask] += (
        one_pole_lp(one_pole_hp(make_noise(len(dt_p)), 350), 2200)
        * env_exp(dt_p, 0.002, 0.045)
        * rng.uniform(0.18, 0.35)
    )
save_ogg("sfx_tnt_explosion", soft_clip(sub_boom + crack_transient + fire_roar + sub_rubble + debris, 1.85))

# 10. sfx_coin.ogg: Real metallic gold coin flick + dual harmonic alloy shimmer
t = np.linspace(0, 0.20, int(SR * 0.20), endpoint=False)
flick = one_pole_hp(make_noise(len(t)), 4200) * env_exp(t, 0.0008, 0.012) * 0.35
p1 = np.sin(2 * np.pi * 1318.51 * t) * env_exp(t, 0.001, 0.065) * 0.55
p2 = np.zeros_like(t)
m2 = t >= 0.036
p2[m2] = (
    np.sin(2 * np.pi * 1975.53 * (t[m2] - 0.036)) * 0.65
    + np.sin(2 * np.pi * 3951.07 * (t[m2] - 0.036)) * 0.25
    + np.sin(2 * np.pi * 2960.0 * (t[m2] - 0.036)) * 0.20
) * env_exp(t[m2] - 0.036, 0.001, 0.085)
save_ogg("sfx_coin", soft_clip(flick + p1 + p2, 1.25))

# 11. sfx_laser.ogg: High-energy plasma discharge sweep + crisp sizzle
t = np.linspace(0, 0.40, int(SR * 0.40), endpoint=False)
fm = np.sin(2 * np.pi * 180 * t) * 4.0 * np.exp(-t * 9.0)
beam = np.sin(sweep_phase(1850, 210, t, 10.0) + fm) * env_exp(t, 0.002, 0.16) * 0.9
sub_zap = np.sin(sweep_phase(220, 55, t, 15.0)) * env_exp(t, 0.002, 0.12) * 0.6
sizzle = one_pole_hp(one_pole_lp(make_noise(len(t)), 5800), 1600) * env_exp(t, 0.003, 0.14) * 0.45
save_ogg("sfx_laser", soft_clip(beam + sub_zap + sizzle, 1.65))

# 12. sfx_portal.ogg: Sci-fi dimensional warp whoosh + harmonic chord shimmer
t = np.linspace(0, 0.36, int(SR * 0.36), endpoint=False)
whoosh = one_pole_lp(make_noise(len(t)), 1800) * env_exp(t, 0.035, 0.14) * 0.65
sweep_up = np.sin(sweep_phase(260, 1120, t)) * env_exp(t, 0.02, 0.12) * 0.55
shimmer = (
    np.sin(2 * np.pi * 587.33 * t + np.sin(2 * np.pi * 14 * t) * 0.4)
    + np.sin(2 * np.pi * 880.0 * t) * 0.7
) * env_exp(t, 0.02, 0.16) * 0.45
save_ogg("sfx_portal", soft_clip(whoosh + sweep_up + shimmer, 1.35))

# 13. sfx_lightning.ogg: Electric arc crackle + sharp static snap
t = np.linspace(0, 0.26, int(SR * 0.26), endpoint=False)
crackle_env = env_exp(t, 0.001, 0.09) * (0.45 + 0.55 * (rng.random(len(t)) > 0.72))
arc_noise = one_pole_hp(make_noise(len(t)), 1900) * crackle_env * 1.15
buzz = np.sign(np.sin(sweep_phase(1380, 320, t, 18.0) + np.sin(2 * np.pi * 95 * t) * 2.5)) * env_exp(t, 0.001, 0.065) * 0.45
save_ogg("sfx_lightning", soft_clip(arc_noise + buzz, 1.6))

# 14. sfx_magpulse.ogg: Deep kinetic shockwave sub + magnetic pull swell
t = np.linspace(0, 0.42, int(SR * 0.42), endpoint=False)
slam = np.sin(sweep_phase(175, 34, t, 16.0)) * env_exp(t, 0.002, 0.18) * 1.1
mag_rise = np.sin(sweep_phase(220, 990, t)) * env_exp(t, 0.025, 0.14) * 0.65
halo = (
    np.sin(2 * np.pi * 659.25 * t) + 0.6 * np.sin(2 * np.pi * 987.77 * t)
) * env_exp(t, 0.04, 0.17) * 0.4
air = one_pole_lp(make_noise(len(t)), 1200) * env_exp(t, 0.004, 0.15) * 0.55
save_ogg("sfx_magpulse", soft_clip(slam + mag_rise + halo + air, 1.55))

# 15. sfx_overclock.ogg: Power core turbine rev + saturated octave lock
t = np.linspace(0, 0.50, int(SR * 0.50), endpoint=False)
rev = np.tanh(np.sin(sweep_phase(140, 880, t)) * 2.2) * env_exp(t, 0.02, 0.19) * 0.65
sub_drive = np.sin(sweep_phase(95, 190, t)) * env_exp(t, 0.02, 0.22) * 0.6
lock = np.zeros_like(t)
ml = t >= 0.18
lock[ml] = (
    np.sin(2 * np.pi * 1046.5 * (t[ml] - 0.18)) * 0.55
    + np.sin(2 * np.pi * 1567.98 * (t[ml] - 0.18)) * 0.45
) * env_exp(t[ml] - 0.18, 0.002, 0.16)
noise_jet = one_pole_hp(one_pole_lp(make_noise(len(t)), 5500), 1200) * env_exp(t, 0.02, 0.16) * 0.4
save_ogg("sfx_overclock", soft_clip(rev + sub_drive + lock + noise_jet, 1.45))

# 16. sfx_drone_shot.ogg: Tight futuristic companion laser pulse
t = np.linspace(0, 0.15, int(SR * 0.15), endpoint=False)
pew = np.sin(sweep_phase(1420, 320, t, 38.0)) * env_exp(t, 0.001, 0.045) * 0.75
tick = one_pole_hp(make_noise(len(t)), 2800) * env_exp(t, 0.0008, 0.015) * 0.4
save_ogg("sfx_drone_shot", soft_clip(pew + tick, 1.3))

# 17. sfx_crit.ogg: Heavy precision anvil crit ring + sub punch
t = np.linspace(0, 0.28, int(SR * 0.28), endpoint=False)
punch = np.sin(sweep_phase(240, 65, t, 36.0)) * env_exp(t, 0.001, 0.05) * 0.85
anvil = (
    np.sin(2 * np.pi * 1180 * t) * 0.55
    + np.sin(2 * np.pi * 1765 * t) * 0.45
    + np.sin(2 * np.pi * 2945 * t) * 0.30
) * env_exp(t, 0.001, 0.11)
slash = one_pole_hp(make_noise(len(t)), 3200) * env_exp(t, 0.001, 0.025) * 0.5
save_ogg("sfx_crit", soft_clip(punch + anvil + slash, 1.5))

# 18. sfx_pickup.ogg: Radiant crystal pickup harmonic triad sweep
t = np.linspace(0, 0.26, int(SR * 0.26), endpoint=False)
sig = np.zeros_like(t)
for idx, freq in enumerate([659.25, 880.0, 1318.51]):
    off = idx * 0.038
    m = t >= off
    dt_n = t[m] - off
    sig[m] += (np.sin(2 * np.pi * freq * dt_n) + 0.3 * np.sin(2 * np.pi * freq * 2 * dt_n)) * env_exp(dt_n, 0.002, 0.085) * 0.45
save_ogg("sfx_pickup", soft_clip(sig, 1.2))

try:
    os.rmdir(TMP_DIR)
except OSError:
    pass
print("DONE! All 18 .ogg SFX generated in src/assets/audio/")
