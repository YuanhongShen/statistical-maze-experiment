// Improved statistical maze task
// Current design: passive familiarisation + smooth-feedback maze.

var jsPsych = initJsPsych({
  message_progress_bar: 'Progress',
  on_finish: function() {
    console.log('Experiment finished.');
  },
  show_progress_bar: true,
  auto_update_progress_bar: true
});

// ==========================================================================================
// Materials and settings
// ==========================================================================================

var WORDS = [
  {
    word: 'kodaqe',
    syllables: ['ko', 'da', 'qe'],
    audio: ['audio/nom/7.wav', 'audio/nom/8.wav', 'audio/nom/9.wav']
  },
  {
    word: 'qimuvu',
    syllables: ['qi', 'mu', 'vu'],
    audio: ['audio/nom/4.wav', 'audio/nom/5.wav', 'audio/nom/6.wav']
  },
  {
    word: 'buxoje',
    syllables: ['bu', 'xo', 'je'],
    audio: ['audio/nom/10.wav', 'audio/nom/11.wav', 'audio/nom/12.wav']
  },
  {
    word: 'ruculu',
    syllables: ['ru', 'cu', 'lu'],
    audio: ['audio/nom/1.wav', 'audio/nom/2.wav', 'audio/nom/3.wav']
  }
];

// Position 1 foils are unattested CV syllables. They never appear in Phase 1.
var UNATTESTED_ONSET_FOILS = ['pa', 'ti', 'ge', 'xu'];

var PHASE1_REPETITIONS_PER_WORD = 24; // 4 words x 24 = 96 word tokens.
var PHASE2_REPETITIONS_PER_WORD = 24; // 96 maze word trials.

var SYLLABLE_DURATION = 500;
var FEEDBACK_DURATION = 700;
var WHOLE_WORD_DURATION = 1000;
var RESPONSE_KEYS = ['e', 'i'];

var AUDIO_CHECK_FILE = 'audio/check_sg.wav';
var AUDIO_CHECK_KEY = 'j';
var SAVE_DATA_ENDPOINT = 'save_data.php';
var PROLIFIC_COMPLETION_URL = 'https://app.prolific.com/submissions/complete?cc=C1MDGY5K'; 
var participant_id = jsPsych.randomization.randomID(15);
var prolific_id = jsPsych.data.getURLVariable('PROLIFIC_PID');
var study_id = jsPsych.data.getURLVariable('STUDY_ID');
var session_id = jsPsych.data.getURLVariable('SESSION_ID');

jsPsych.data.addProperties({
  participant_id: participant_id,
  prolific_id: prolific_id,
  study_id: study_id,
  session_id: session_id
});

// ==========================================================================================
// Helpers
// ==========================================================================================

function playAudio(path) {
  var audio = new Audio(path);
  audio.play();
}

function makeLeftAligned(html) {
  return '<div class="screen-copy">' + html + '</div>';
}

function safeFilenamePart(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value).replace(/[^A-Za-z0-9_.-]/g, '_');
}

function makeDataFilename() {
  return [
    safeFilenamePart(participant_id, 'participant'),
    safeFilenamePart(prolific_id, 'no-prolific-id'),
    safeFilenamePart(session_id, 'no-session-id'),
    'final.csv'
  ].join('_');
}

function saveData(filename, filedata) {
  return fetch(SAVE_DATA_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({
      filename: filename,
      filedata: filedata
    }),
    headers: new Headers({
      'Content-Type': 'application/json'
    })
  }).then(function(response) {
    if (!response.ok) {
      throw new Error('Server returned ' + response.status);
    }
    return response.json();
  });
}

function saveExperimentData(done) {
  var filename = makeDataFilename();
  var csv = jsPsych.data.get().csv();

  window.experimentSaveStatus = 'saving';

  saveData(filename, csv)
    .then(function() {
      window.experimentSaveStatus = 'saved';
      window.experimentSavedFilename = filename;
      done('saved');
    })
    .catch(function(error) {
      console.error('Data save failed:', error);
      window.experimentSaveStatus = 'failed';
      window.experimentSaveError = error.message;
      done('failed');
    });
}

function makeRepeatedWordList(words, repetitions) {
  var repeated = [];

  for (var rep = 0; rep < repetitions; rep++) {
    var block = jsPsych.randomization.shuffle(words.map(function(word, wordId) {
      return {
        word: word.word,
        syllables: word.syllables,
        audio: word.audio,
        word_id: wordId,
        repetition: rep
      };
    }));
    repeated = repeated.concat(block);
  }

  return repeated;
}

function possibleFoilsFor(wordObj, position) {
  if (position === 0) {
    return UNATTESTED_ONSET_FOILS.map(function(onsetFoil) {
      return {
        syllable: onsetFoil,
        word: null,
        word_id: null,
        syllable_position: null,
        foil_source: 'unattested_onset_syllable'
      };
    });
  }

  var targetSyllable = wordObj.syllables[position];

  return WORDS
    .map(function(w, wordId) {
      return {
        syllable: w.syllables[position],
        word: w.word,
        word_id: wordId,
        syllable_position: position + 1,
        foil_source: 'same_position_other_word'
      };
    })
    .filter(function(candidate) {
      return candidate.syllable !== targetSyllable;
    });
}

function makeBalancedFoilSequence(items, count) {
  var sequence = [];
  var base = Math.floor(count / items.length);
  var remainder = count - base * items.length;

  items.forEach(function(item) {
    for (var k = 0; k < base; k++) {
      sequence.push(item);
    }
  });

  var extraItems = jsPsych.randomization.sampleWithoutReplacement(items, remainder);
  extraItems.forEach(function(item) {
    sequence.push(item);
  });

  return jsPsych.randomization.shuffle(sequence);
}

function makeFoilPlan(words, repetitions) {
  var plan = {};

  words.forEach(function(wordObj, wordId) {
    plan[wordId] = {};
    for (var position = 0; position < wordObj.syllables.length; position++) {
      var foils = possibleFoilsFor(wordObj, position);
      plan[wordId][position] = makeBalancedFoilSequence(foils, repetitions);
    }
  });

  return plan;
}

function makeMazeTimelineVariables(wordObj, runningWordIndex, foilPlan) {
  var trials = [];

  for (var position = 0; position < wordObj.syllables.length; position++) {
    var target = wordObj.syllables[position];
    var foil = foilPlan[wordObj.word_id][position][wordObj.repetition];
    var isCoreTpTrial = position > 0;

    trials.push({
      Target: target,
      Distractor: foil.syllable,
      Syll_num: position,
      Word_idx: runningWordIndex,
      word: wordObj.word,
      word_id: wordObj.word_id,
      repetition: wordObj.repetition,
      syllable_position: position + 1,
      previous_syllable: position === 0 ? null : wordObj.syllables[position - 1],
      target_transition: position === 0 ? null : wordObj.syllables[position - 1] + '-' + target,
      distractor_word: foil.word,
      distractor_word_id: foil.word_id,
      distractor_syllable_position: foil.syllable_position,
      foil_source: foil.foil_source,
      analysis_role: isCoreTpTrial ? 'within_word_tp' : 'known_onset_vs_unattested_baseline',
      is_core_tp_trial: isCoreTpTrial ? 1 : 0,
      phase: 'maze'
    });
  }

  return trials;
}

function responseIsCorrect(data) {
  return (
    data.response === 'e' && data.stimulus_left === data.Target
  ) || (
    data.response === 'i' && data.stimulus_right === data.Target
  );
}

// ==========================================================================================
// Audio preloading and participant setup
// ==========================================================================================

var audioToPreload = [AUDIO_CHECK_FILE];
WORDS.forEach(function(word) {
  audioToPreload = audioToPreload.concat(word.audio);
});

var preload = {
  type: jsPsychPreload,
  audio: audioToPreload,
  show_progress_bar: false,
  data: {
    phase: 'setup',
    task: 'preload'
  }
};

var browserCheck = {
  type: jsPsychBrowserCheck,
  inclusion_function: function(data) {
    var acceptableBrowsers = ['chrome', 'firefox', 'safari', 'edge-chromium'];
    return acceptableBrowsers.includes(data.browser) && data.mobile === false;
  },
  exclusion_message: function() {
    return '<p>You must use a <b>desktop/laptop computer</b> with <b>Chrome, Firefox, or Safari</b> to participate in this experiment.</p>';
  },
  data: {
    phase: 'setup',
    task: 'browser_check'
  }
};

// ==========================================================================================
// Intro and audio check
// ==========================================================================================

var antiTablet = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <p><b>Hi! Thanks for your interest in this experiment!</b></p>
    <p>Please press the <b>space bar</b> to continue.</p>
    <p>(If you cannot press the space bar because you are using a tablet, please switch to a desktop or laptop computer.)</p>
  `,
  choices: [' '],
  data: {
    phase: 'setup',
    task: 'anti_tablet'
  }
};

var consent = {
  type: jsPsychHtmlButtonResponse,
  css_classes: ['align-left-trial'],
  stimulus:makeLeftAligned( `
    <p>The task will take approximately 15 minutes to complete.</p>
    <p>This experiment is being conducted by Yuanhong Shen under the supervision of Dr.Elizabeth Pankratz at the University of Edinburgh. It has been approved by the PPLS ethics committee.</p>
    <p>Please <a href="informationsheet.pdf" target="_blank" rel="noopener">click here</a> to read an information sheet (PDF) about the study and your rights as a participant.</p>
    <p>Clicking the button below indicates that:</p>
    <ul>
      <li>you are a native speaker of English and at least 18 years old;</li>
      <li>you agree to participate in this study;</li>
      <li>you understand that your responses and reaction times will be recorded for research purposes; and</li>
      <li>you understand that you have the right to terminate this session at any point.</li>
    </ul>
    <p>If you do not agree to all of these, please close this window now.</p>
  `),
  choices: ['Yes, I consent to participate'],
  data: {
    phase: 'consent',
    task: 'consent'
  }
};

var audioCheckIntro = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <p>First we will make sure that your sound is working.</p>
    <p>Please use headphones and make sure that the volume on your computer is turned up.</p>
    <p>After you click the button on this page, we will play a test sound.</p>
    <p><b>Please press the key on your keyboard that matches the letter that you are hearing.</b></p>
    <p>If you hear nothing, please fix your audio setup, refresh this page, and try again.</p>
  `,
  choices: ["I'm wearing headphones, play the test sound"],
  data: {
    phase: 'audio_check',
    task: 'audio_check_intro'
  }
};

var audioCheck = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <audio id="test-audio" src="${AUDIO_CHECK_FILE}" loop></audio>
    <p>What letter do you hear?</p>
  `,
  choices: 'ALL_KEYS',
  on_load: function() {
    var audioNode = document.getElementById('test-audio');
    if (audioNode) {
      audioNode.play();
    }
  },
  on_finish: function(data) {
    var audioNode = document.getElementById('test-audio');
    if (audioNode) {
      audioNode.pause();
    }
    
    data.phase = 'audio_check';
    data.task = 'audio_check_response';
    data.correct = jsPsych.pluginAPI.compareKeys(data.response, AUDIO_CHECK_KEY) ? 1 : 0;
  }
};

var audioCheckFeedback = {
  type: jsPsychHtmlKeyboardResponse,
  choices: [AUDIO_CHECK_KEY],
  stimulus: function() {
    var last = jsPsych.data.get().last(1).values()[0];
    if (last.correct === 1) {
      return "<p>That's right!</p><p>Press the same key again to continue to the experiment.</p>";
    }
    return "<p>That's incorrect. Please fix your audio setup if needed, refresh this page, and try again.</p>";
  },
  data: {
    phase: 'audio_check',
    task: 'audio_check_feedback'
  }
};

var audioCheckLoop = {
  timeline: [audioCheck, audioCheckFeedback],
  loop_function: function(data) {
    var lastAudioAttempt = data
      .filter({ task: 'audio_check_response' })
      .last(1)
      .values()[0];

    return lastAudioAttempt.correct !== 1;
  }
};

var enterFullscreen = {
  type: jsPsychFullscreen,
  fullscreen_mode: true,
  message: '<p>The experiment will switch to fullscreen mode when you press the button below.</p>',
  button_label: 'Continue with fullscreen',
  data: {
    phase: 'setup',
    task: 'enter_fullscreen'
  }
};

var generalInstructions = {
  type: jsPsychHtmlButtonResponse,
  stimulus: makeLeftAligned(`
    <p><b>We have been receiving an interplanetary transmission in an alien language. How well can you learn this language?</b></p>
    <p>The challenge is that the aliens can only transmit one syllable at a time.</p>
    <p>Your task is to pay attention to the stream of individual syllables and try to recognise patterns within it.</p>
    <p>Later, we will test you on your knowledge of the language.</p>
  `),
  choices: ['I understand'],
  data: {
    phase: 'intro',
    task: 'general_instructions'
  }
};

// ==========================================================================================
// Phase 1: passive familiarisation
// ==========================================================================================

var phase1Intro = {
  type: jsPsychHtmlButtonResponse,
  stimulus: makeLeftAligned(`
    <p>You will now see and hear a series of syllables presented one after another.</p>
    <p>After you have finished the transmission stream, we will ask you to make choices about syllables from the language.</p>
    <p>Please keep your attention on the screen.</p>
    <p>This part of the experiment will last approximately two minutes.</p>
  `),
  choices: ["I'm ready"],
  data: {
    phase: 'phase1_intro',
    task: 'phase1_intro'
  }
};

var phase1Fixation = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: '<div style="font-size:40px;">+</div>',
  choices: 'NO_KEYS',
  trial_duration: 1000,
  data: {
    phase: 'passive_familiarisation',
    task: 'fixation'
  }
};

var phase1WordStream = makeRepeatedWordList(WORDS, PHASE1_REPETITIONS_PER_WORD);
var phase1Trials = [];
var streamIndex = 0;

for (var i = 0; i < phase1WordStream.length; i++) {
  var currentWord = phase1WordStream[i];

  for (var pos = 0; pos < currentWord.syllables.length; pos++) {
    phase1Trials.push({
      type: jsPsychAudioKeyboardResponse,
    stimulus: currentWord.audio[pos],
    prompt: '<p class="syllable">' + currentWord.syllables[pos] + '</p>',
    choices: 'NO_KEYS',
    trial_ends_after_audio: true,
    post_trial_gap: 0,
    data: {
      phase: 'passive_familiarisation',
      task: 'phase1_stream',
      stream_index: streamIndex,
      word: currentWord.word,
      word_id: currentWord.word_id,
      repetition: currentWord.repetition,
      syllable: currentWord.syllables[pos],
      syllable_position: pos + 1,
      audio_file: currentWord.audio[pos]
      }
    });
    streamIndex++;
  }
}

// ==========================================================================================
// Phase 2: improved statistical maze
// ==========================================================================================

var phase2Intro = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: makeLeftAligned(`
    <p>You have reached the end of the transmission stream.</p>
    <p>Now you will choose between two syllables at a time. Based on the alien language you just heard, choose the syllable that fits the pattern.</p>
    <p><b>Press E for the syllable on the left. Press I for the syllable on the right.</b></p>
    <p style="text-align:center;">
      <img src="keyboard.png" alt="Keyboard showing E and I key positions" style="max-width: 400px; width: 100%;">
    </p>
    <p>Once your hands are positioned on the E and I keys, press the <b>space bar</b> to continue.</p>
    <p>After each choice, the correct syllable will be highlighted and the task will continue automatically.</p>
    <p>Please respond as quickly and accurately as you can.</p>
  `),
  choices: [' '],
  data: {
    phase: 'maze_intro',
    task: 'maze_intro'
  }
};

var mazeTrial = {
  type: jsPsychMazeKeyboard,
  choices: RESPONSE_KEYS,
  on_start: function(trial) {
    var randomOrder = jsPsych.randomization.shuffle([
      jsPsych.timelineVariable('Target'),
      jsPsych.timelineVariable('Distractor')
    ]);

    trial.stimulus_left = randomOrder[0];
    trial.stimulus_right = randomOrder[1];
    trial.Target = jsPsych.timelineVariable('Target');
    trial.Distractor = jsPsych.timelineVariable('Distractor');
  },
  on_finish: function(data) {
    data.correct = responseIsCorrect(data) ? 1 : 0;
    data.selected_syllable = data.response === 'e' ? data.stimulus_left : data.stimulus_right;
    data.Syll_num = jsPsych.timelineVariable('Syll_num');
    data.Word_idx = jsPsych.timelineVariable('Word_idx');
    data.word = jsPsych.timelineVariable('word');
    data.word_id = jsPsych.timelineVariable('word_id');
    data.repetition = jsPsych.timelineVariable('repetition');
    data.syllable_position = jsPsych.timelineVariable('syllable_position');
    data.previous_syllable = jsPsych.timelineVariable('previous_syllable');
    data.target_transition = jsPsych.timelineVariable('target_transition');
    data.distractor_word = jsPsych.timelineVariable('distractor_word');
    data.distractor_word_id = jsPsych.timelineVariable('distractor_word_id');
    data.distractor_syllable_position = jsPsych.timelineVariable('distractor_syllable_position');
    data.foil_source = jsPsych.timelineVariable('foil_source');
    data.analysis_role = jsPsych.timelineVariable('analysis_role');
    data.is_core_tp_trial = jsPsych.timelineVariable('is_core_tp_trial');
    data.phase = 'maze';
    data.task = 'maze_choice';
  }
};

var correctionFeedback = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function() {
    var data = jsPsych.data.get().last(1).values()[0];

    function cls(syllable) {
      if (syllable === data.Target) {
        return 'correct';
      }
      if (syllable === data.selected_syllable && data.correct === 0) {
        return 'incorrect';
      }
      return 'neutral';
    }

    return `
      <div class="choice-feedback">
        <span class="${cls(data.stimulus_left)}">${data.stimulus_left}</span>
        <span class="${cls(data.stimulus_right)}">${data.stimulus_right}</span>
      </div>
    `;
  },
  choices: 'NO_KEYS',
  trial_duration: FEEDBACK_DURATION,
  data: function() {
    var last = jsPsych.data.get().last(1).values()[0];
    return {
      phase: 'maze',
      task: 'maze_feedback',
      word: last.word,
      word_id: last.word_id,
      repetition: last.repetition,
      syllable_position: last.syllable_position,
      previous_syllable: last.previous_syllable,
      target_transition: last.target_transition,
      target_syllable: last.Target,
      foil_syllable: last.Distractor,
      selected_syllable: last.selected_syllable,
      previous_choice_correct: last.correct,
      foil_source: last.foil_source,
      analysis_role: last.analysis_role,
      is_core_tp_trial: last.is_core_tp_trial
    };
  }
};

var mazeChoiceWithFeedback = {
  timeline: [mazeTrial, correctionFeedback]
};

var phase2WordStream = makeRepeatedWordList(WORDS, PHASE2_REPETITIONS_PER_WORD);
var foilPlan = makeFoilPlan(WORDS, PHASE2_REPETITIONS_PER_WORD);
var allMazes = [];

for (var j = 0; j < phase2WordStream.length; j++) {
  var currWord = phase2WordStream[j];
  var mazeVariables = makeMazeTimelineVariables(currWord, j, foilPlan);

  allMazes.push({
    timeline: [mazeChoiceWithFeedback],
    timeline_variables: mazeVariables
  });

  allMazes.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<p style="color: forestgreen; font-size: 34px; font-weight: 600;">' + currWord.word + '</p>',
    choices: 'NO_KEYS',
    trial_duration: WHOLE_WORD_DURATION,
    data: {
      phase: 'maze',
      task: 'whole_word_feedback',
      word: currWord.word,
      word_id: currWord.word_id,
      repetition: currWord.repetition,
      Word_idx: j
    }
  });
}

// ==========================================================================================
// End
// ==========================================================================================

var debriefHtml = `
<p><b>That is it. Thank you for your participation.</b></p>
<p>Please answer a few final questions.</p>
<table>
<tr>
<td align="left">How old are you?</td>
<td><input id="age" name="age" type="text" required /></td>
</tr>
<tr>
<td align="left">What country have you spent most of your life in?</td>
<td><input name="main-country" type="text" required /></td>
</tr>
<tr>
<td align="left">If you have another first language besides English, please enter it here.<br>(If you know only English, please enter "NA")</td>
<td><input name="other-first-language" type="text" required /></td>
</tr>
<tr>
<td align="left">If you understand or speak any additional languages, please enter them here.<br>(If you know only English, please enter "NA")</td>
<td><input name="other-languages" type="text" required /></td>
</tr>
<tr>
<td align="left"><i>Optional:</i> Any other comments for us?</td>
<td><input name="comments" type="text" /></td>
</tr>
</table><br>
`;

var debrief = {
  type: jsPsychSurveyHtmlForm,
  html: debriefHtml,
  autofocus: 'age',
  data: {
    phase: 'debrief',
    task: 'debrief'
  }
};

var saveDataTrial = {
  type: jsPsychCallFunction,
  async: true,
  func: saveExperimentData,
  data: {
    phase: 'save_data',
    task: 'save_data'
  }
};

var finalScreen = {
  type: jsPsychHtmlButtonResponse,
  stimulus: function() {
    if (window.experimentSaveStatus === 'failed') {
      return '<p>There was a problem submitting your responses automatically.</p><p>Please contact the researcher before closing this window.</p>';
    }
    return '<p>You are all done. Thanks for participating!</p>';
  },
  choices: ['Exit fullscreen and finish experiment'],
  data: {
    phase: 'end',
    task: 'final_screen'
  }
};

var exitFullscreen = {
  type: jsPsychFullscreen,
  fullscreen_mode: false,
  on_finish: function() {
    if (PROLIFIC_COMPLETION_URL !== '') {
      window.location.href = PROLIFIC_COMPLETION_URL;
    }
  },
  data: {
    phase: 'end',
    task: 'exit_fullscreen'
  }
};

var timeline = []
  .concat(preload)
  .concat(browserCheck)
  .concat(antiTablet)
  .concat(consent)
  .concat(audioCheckIntro)
  .concat(audioCheckLoop)
  .concat(enterFullscreen)
  .concat(generalInstructions)
  .concat(phase1Intro)
  .concat(phase1Fixation)
  .concat(phase1Trials)
  .concat(phase2Intro)
  .concat(allMazes)
  .concat(debrief)
  .concat(saveDataTrial)
  .concat(finalScreen)
  .concat(exitFullscreen)
  .flat();

jsPsych.run(timeline);
