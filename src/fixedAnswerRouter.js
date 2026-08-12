const { findCommunityAnswer } = require('./communityAnswers');
const { findDrugAnswer } = require('./drugAnswers');
const { findJobAnswer } = require('./jobAnswers');
const { findServerAnswer } = require('./serverAnswers');
const { findUtilityAnswer } = require('./utilityAnswers');

function findFixedAnswer(question, options = {}) {
  return (
    findCommunityAnswer(question) ||
    findUtilityAnswer(question) ||
    findJobAnswer(question, options) ||
    findDrugAnswer(question, options) ||
    findServerAnswer(question, options)
  );
}

module.exports = {
  findFixedAnswer
};
