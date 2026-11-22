/** @typedef {{ title: string, happens: string, when: string, caveat: string }} HelpTopic */

/** @type {Record<string, HelpTopic>} */
export const HELP_TOPICS = {
  unknown: {
    title: 'This control',
    happens: 'Show me has no notes for this control yet.',
    when: 'Turn Show me off when you are ready to use the controller.',
    caveat: 'Show me never changes the practice day.'
  },
  instructions: {
    title: 'Instructions',
    happens: 'Opens the controller instructions in this browser.',
    when: 'When you want the race-day sequence written out, including sign-in, conflicts, and signing out.',
    caveat: 'The instructions page is public. It does not change the practice day.'
  },
  'show-me': {
    title: 'Show me',
    happens: 'Turns learning mode on or off. While it is on, tapping a control explains it and does not change KartBoard.',
    when: 'Before a practice day, or when a new controller wants to look around without signing in.',
    caveat: 'This device remembers the choice. Turn it off before you run the day. Nothing is saved to the board while it is on.'
  },
  'close-help': {
    title: 'Close the note',
    happens: 'Closes this explanation and returns you to the controller.',
    when: 'When you have read the note.',
    caveat: 'Escape does the same thing. Closing the note does not turn Show me off.'
  },
  'access-code': {
    title: 'Enter your access code',
    happens: 'You type the code you were given. KartBoard matches that code to a controller. You do not type a name.',
    when: 'When the sign-in card is on screen.',
    caveat: 'Letters and digits both work, and an older numeric code still works. The code is shown as you type it on this device only.'
  },
  unlock: {
    title: 'Unlock',
    happens: 'Sends the access code. If it matches, this device signs in and the page shows Signed in as that controller.',
    when: 'After the code is entered.',
    caveat: 'A code that does not match stays on the sign-in card. Show me does not send the code.'
  },
  logout: {
    title: 'Sign out',
    happens: 'Clears the sign-in on this device and brings back the access-code card.',
    when: 'When you hand the phone to someone else, or you are finished for the day.',
    caveat: 'Signing out here does not sign out other devices. It does not change the public board.'
  },
  'open-board': {
    title: 'Open public board',
    happens: 'Opens the public board in another window so you can see what the paddock sees.',
    when: 'Any time you want to check the display without leaving the controller.',
    caveat: 'The public board is view only. Closing it does not sign you out.'
  },
  'day-setup': {
    title: 'Day setup',
    happens: 'Opens the setup card for the venue, the practice label, the usual session length, and the running order.',
    when: 'Before the first session, or after Finish day when you want a new order.',
    caveat: 'Saving setup replaces the running order and clears a notice. It is only available before the day starts or after it is finished.'
  },
  'refresh-conflict': {
    title: 'Refresh after a conflict',
    happens: 'Reloads the practice day from the server and hides the conflict banner once you have seen the latest order.',
    when: 'When another controller saved a change before yours, and KartBoard refused your change.',
    caveat: 'Your unsaved edit was not applied. Look at the refreshed order, then make the change again if you still need it.'
  },
  'main-action': {
    title: 'Main session button',
    happens: 'Starts the first session, starts the next class, resumes a pause or a break, or starts a new day after Finish. The label changes with the state of the day.',
    when: 'This is the button you use most. Tap it to put a class on track or to move to the next one.',
    caveat: 'Starting the next class resets that session clock to the usual length. The public board updates immediately.'
  },
  pause: {
    title: 'Pause or resume',
    happens: 'Pauses the countdown, or resumes it with the same time that was left.',
    when: 'When the session should wait without moving on to the next class.',
    caveat: 'Pause is only for a running or already paused session. A break uses Resume on the main button instead.'
  },
  'add-minute': {
    title: '+ 1 minute',
    happens: 'Gives the current session one more minute. The countdown ends later, and the public board shows the new time.',
    when: 'When the class on track needs a little longer.',
    caveat: 'It only changes the current session. It does not reorder classes. It is available while the session is running or paused.'
  },
  'advance-minute': {
    title: 'Advance by 1 minute',
    happens: 'Brings the current session forward by one minute, so the countdown ends sooner and the next class can start earlier. The public board shows the new time immediately.',
    when: 'When the class on track should finish one minute sooner.',
    caveat: 'The clock stops at zero. It does not skip a class and it does not borrow time from the next session. Use the main button when you actually want the next class.'
  },
  changeover: {
    title: 'Changeover',
    happens: 'Marks a changeover on the public board and clears the session clock.',
    when: 'Between classes, while karts are leaving or entering the track and you are not ready to start the next countdown.',
    caveat: 'The running order does not move until you tap the main button to start the next session.'
  },
  previous: {
    title: 'Previous class',
    happens: 'Puts the previous class back on track and starts its clock at the usual length.',
    when: 'When the current class was started by mistake.',
    caveat: 'The public board changes immediately. The time already run is not restored.'
  },
  break: {
    title: 'Take a break',
    happens: 'Shows a break on the public board and clears the session clock.',
    when: 'For lunch or a stop that is not a normal class change.',
    caveat: 'The main button then resumes the class that was current. It does not skip ahead.'
  },
  finish: {
    title: 'Finish day',
    happens: 'Marks the practice day finished on the public board and clears the clock.',
    when: 'When practice is over.',
    caveat: 'You can start a new day afterwards from the main button or from Day setup. Finish does not delete the running order.'
  },
  notice: {
    title: 'Paddock notice',
    happens: 'The text that will be posted to the public board, such as lunch time or a short announcement.',
    when: 'When the paddock needs a message that stays on the board.',
    caveat: 'Typing here does not publish the notice until you tap Post. Starting the next class clears the notice.'
  },
  'post-notice': {
    title: 'Post notice',
    happens: 'Saves the notice onto the practice day. Every public board shows it.',
    when: 'After you have written the message.',
    caveat: 'An empty note clears the notice. Another controller can replace it.'
  },
  'running-order': {
    title: 'Running order',
    happens: 'Shows today’s classes. A long press, or the handle, opens edit mode so you can reorder what comes next.',
    when: 'When you need to change a later class without stopping the one on track.',
    caveat: 'The class on track and its clock stay as they are. Tap Done to save, or Cancel to discard.'
  },
  'running-order-edit': {
    title: 'Change running order',
    happens: 'Opens edit mode for the running order.',
    when: 'When a long press is awkward, use this handle.',
    caveat: 'Nothing is saved until you tap Done.'
  },
  'cancel-rotation': {
    title: 'Cancel order edits',
    happens: 'Drops the unsaved running-order edits and shows the saved order again.',
    when: 'When you opened edit mode by mistake.',
    caveat: 'Classes you dragged are not kept.'
  },
  'save-rotation': {
    title: 'Done',
    happens: 'Saves the new running order. The public board’s coming-up classes update. The current session clock is unchanged.',
    when: 'When the future order looks right.',
    caveat: 'If someone else saved first, KartBoard asks you to refresh instead of overwriting them.'
  },
  'add-class': {
    title: 'Add a class',
    happens: 'Adds that class to the end of the order you are editing.',
    when: 'When a usual class is missing from today.',
    caveat: 'This stays on this device until you tap Done or Save running order. Classes already in the order are not offered again.'
  },
  'custom-class': {
    title: 'Custom class name',
    happens: 'Holds a class name that is not in the usual list.',
    when: 'When you need a one-off class.',
    caveat: 'Tap Add to put it in the order. It is not saved until you save the order.'
  },
  'add-custom': {
    title: 'Add custom class',
    happens: 'Adds the custom name to the order you are editing.',
    when: 'After you type a name that is not in the chips.',
    caveat: 'An empty name does nothing. Save the order afterwards.'
  },
  'drag-handle': {
    title: 'Drag to reorder',
    happens: 'Drag the class to a new place in the order.',
    when: 'While you are editing the running order or the day setup.',
    caveat: 'On a phone you can also use the up and down buttons in day setup. The current session is not interrupted.'
  },
  'move-up': {
    title: 'Move class up',
    happens: 'Moves this class one place earlier in the order.',
    when: 'When dragging is difficult.',
    caveat: 'The first class cannot move up. Save the order to publish it.'
  },
  'move-down': {
    title: 'Move class down',
    happens: 'Moves this class one place later in the order.',
    when: 'When dragging is difficult.',
    caveat: 'The last class cannot move down. Save the order to publish it.'
  },
  'rename-class': {
    title: 'Rename class',
    happens: 'Opens the name editor for this class.',
    when: 'When the name on the board should change.',
    caveat: 'The new name is saved with the running order, not before.'
  },
  'duplicate-class': {
    title: 'Duplicate class',
    happens: 'Inserts another copy of this class after it.',
    when: 'When the same class runs twice.',
    caveat: 'The copy is its own entry. Removing one does not remove the other.'
  },
  'remove-class': {
    title: 'Remove class',
    happens: 'Takes this class out of the order you are editing.',
    when: 'When a class is not running today.',
    caveat: 'The order must keep at least one class. Removing the class that is on track does not stop that session; it only changes what comes later.'
  },
  'close-setup': {
    title: 'Close setup',
    happens: 'Closes day setup without saving.',
    when: 'When you opened setup by mistake.',
    caveat: 'Edits in the setup card are discarded.'
  },
  'setup-venue': {
    title: 'Venue',
    happens: 'The venue name shown on the public board.',
    when: 'During day setup.',
    caveat: 'It is saved only when you tap Save running order.'
  },
  'setup-day': {
    title: 'Practice label',
    happens: 'The label for this practice, such as Saturday Practice.',
    when: 'During day setup.',
    caveat: 'It is saved only when you tap Save running order.'
  },
  'setup-minutes': {
    title: 'Usual session length',
    happens: 'How long a newly started class counts down, in minutes.',
    when: 'During day setup, before sessions begin.',
    caveat: 'From 1 to 30 minutes. It does not change a clock that is already running. Use + 1 minute or Advance by 1 minute for the class on track.'
  },
  'cancel-setup': {
    title: 'Cancel setup',
    happens: 'Closes day setup and keeps the saved day.',
    when: 'When you do not want to keep the setup edits.',
    caveat: 'Nothing is written to the board.'
  },
  'save-setup': {
    title: 'Save running order',
    happens: 'Saves the venue, label, session length, and order, and sets the day back to ready with the first class current.',
    when: 'Before the first session, when setup looks right.',
    caveat: 'This clears a paddock notice and does not start the clock. If the revision is stale, refresh and try again.'
  },
  'close-edit-class': {
    title: 'Close class name',
    happens: 'Closes the name editor without renaming.',
    when: 'When you opened rename by mistake.',
    caveat: 'The previous name stays.'
  },
  'edit-class-name': {
    title: 'Class name',
    happens: 'The name that drivers will see for this class.',
    when: 'While renaming a class in day setup.',
    caveat: 'Up to 40 characters. Tap Save to keep it in the setup draft.'
  },
  'cancel-edit-class': {
    title: 'Cancel rename',
    happens: 'Closes the name editor without renaming.',
    when: 'When the current name is fine.',
    caveat: 'The setup draft is unchanged.'
  },
  'save-edit-class': {
    title: 'Save class name',
    happens: 'Puts the new name into the setup draft.',
    when: 'When the name reads the way you want.',
    caveat: 'The public board changes only after you save the running order.'
  }
};

/** @param {string} key @returns {HelpTopic | null} */
export function helpTopic(key) {
  return HELP_TOPICS[key] || null;
}

/** @param {HelpTopic | null | undefined} topic */
export function topicComplete(topic) {
  return Boolean(topic && topic.title && topic.happens && topic.when && topic.caveat);
}
