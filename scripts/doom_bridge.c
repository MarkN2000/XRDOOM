// SPDX-License-Identifier: GPL-2.0-or-later
#include <stdint.h>
#include <emscripten.h>
#include <SDL.h>
#include <SDL_mixer.h>
#include "doomgeneric.h"
#include "doomkeys.h"
#include "doomdef.h"
#include "doomstat.h"
#include "d_event.h"
#include "d_loop.h"
#include "m_controls.h"
#include "i_sound.h"
#include "s_sound.h"

extern int mousex;
static int loop_suspended;

static void arcade_tick(void) {
    doomgeneric_Tick();
    if (paused) {
        loop_suspended = 1;
        emscripten_pause_main_loop();
    }
}

EM_JS(void, draw_frame, (uint8_t *pixels), {
    Module.onFrame(HEAPU8, pixels);
});
EM_JS(void, ready, (), {
    const audio = Module['SDL2'];
    if (audio && audio.audio) {
        Module.onAudio(audio.audioContext, audio.audio.scriptProcessorNode);
    }
    Module.onReady();
});

void DG_Init(void) {}
void DG_DrawFrame(void) { draw_frame((uint8_t *)DG_ScreenBuffer); }
void DG_SleepMs(uint32_t ms) { emscripten_sleep(ms); }
uint32_t DG_GetTicksMs(void) { return (uint32_t)emscripten_get_now(); }
int DG_GetKey(int *pressed, unsigned char *key) { return 0; }
void DG_SetWindowTitle(const char *title) {}

EMSCRIPTEN_KEEPALIVE void arcade_key(int key, int down) {
    event_t event = {0};
    event.type = down ? ev_keydown : ev_keyup;
    event.data1 = key;
    event.data2 = key;
    event.data3 = key;
    D_PostEvent(&event);
}
EMSCRIPTEN_KEEPALIVE void arcade_turn(int delta) { mousex += delta * 2; }
EMSCRIPTEN_KEEPALIVE void arcade_pause(int value) {
    mousex = 0;
    if (paused == value) return;
    paused = value;
    Mix_PauseAudio(value);
    if (paused) S_PauseSound();
    else {
        S_ResumeSound();
        if (loop_suspended) {
            loop_suspended = 0;
            emscripten_resume_main_loop();
        }
    }
}
EMSCRIPTEN_KEEPALIVE void arcade_run(int value) { key_speed = value ? 256 : KEY_RSHIFT; }
EMSCRIPTEN_KEEPALIVE void arcade_stop(void) {
    emscripten_cancel_main_loop();
    I_ShutdownSound();
    SDL_Quit();
}
int main(int argc, char **argv) {
    setenv("TIMIDITY_CFG", "/timidity/timidity.cfg", 1);
    singletics = true;
    doomgeneric_Create(argc, argv);
    key_nextweapon = 'n';
    arcade_run(0);
    ready();
    emscripten_set_main_loop(arcade_tick, 35, 1);
    return 0;
}
