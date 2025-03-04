const express = require('express');
const router = express.Router();
const errorCodes = require('../docs/errors.json');

router.get('/errors/:code', (req, res) => {
  const errorDoc = errorCodes[req.params.code];
  if (!errorDoc) {
    return res.status(404).json({
      error: 'error_not_found',
      message: 'Error documentation not found'
    });
  }
  res.json({
    code: req.params.code,
    ...errorDoc,
    documentation_url: `${process.env.API_ERRORS_DOC_URL}/${req.params.code}`
  });
});

module.exports = router;