let xslt_ext_hideRequestId = 0;

// === XSLT COMPARISON MODE ===
// Save native XSLTProcessor before polyfill potentially overwrites it
const NativeXSLTProcessor = window.XSLTProcessor;
const NativeXMLSerializer = window.XMLSerializer;

// Comparison wrapper that runs transforms through both native and polyfill
function createComparisonWrapper() {
  if (!NativeXSLTProcessor) {
    console.warn('[XSLT Comparison] Native XSLTProcessor not available - comparison disabled');
    return;
  }

  const PolyfillXSLTProcessor = window.XSLTProcessor;

  // If polyfill didn't load or didn't replace XSLTProcessor, skip
  if (NativeXSLTProcessor === PolyfillXSLTProcessor) {
    console.warn('[XSLT Comparison] Polyfill XSLTProcessor not detected - comparison disabled');
    return;
  }

  class ComparisonXSLTProcessor {
    constructor() {
      this._native = new NativeXSLTProcessor();
      this._polyfill = new PolyfillXSLTProcessor();
      this._stylesheet = null;
      this._params = [];
    }

    importStylesheet(style) {
      this._stylesheet = style;
      try {
        this._native.importStylesheet(style);
      } catch (e) {
        console.error('[XSLT Comparison] Native importStylesheet error:', e);
      }
      try {
        this._polyfill.importStylesheet(style);
      } catch (e) {
        console.error('[XSLT Comparison] Polyfill importStylesheet error:', e);
      }
    }

    setParameter(namespaceURI, localName, value) {
      this._params.push({ namespaceURI, localName, value });
      try {
        this._native.setParameter(namespaceURI, localName, value);
      } catch (e) {
        console.error('[XSLT Comparison] Native setParameter error:', e);
      }
      try {
        this._polyfill.setParameter(namespaceURI, localName, value);
      } catch (e) {
        console.error('[XSLT Comparison] Polyfill setParameter error:', e);
      }
    }

    getParameter(namespaceURI, localName) {
      return this._native.getParameter(namespaceURI, localName);
    }

    removeParameter(namespaceURI, localName) {
      this._native.removeParameter(namespaceURI, localName);
      this._polyfill.removeParameter(namespaceURI, localName);
    }

    clearParameters() {
      this._params = [];
      this._native.clearParameters();
      this._polyfill.clearParameters();
    }

    reset() {
      this._stylesheet = null;
      this._params = [];
      this._native.reset();
      this._polyfill.reset();
    }

    transformToDocument(source) {
      let nativeResult = null;
      let polyfillResult = null;
      let nativeError = null;
      let polyfillError = null;

      try {
        nativeResult = this._native.transformToDocument(source);
      } catch (e) {
        nativeError = e;
      }

      try {
        polyfillResult = this._polyfill.transformToDocument(source);
      } catch (e) {
        polyfillError = e;
      }

      this._compareAndLog('transformToDocument', nativeResult, polyfillResult, nativeError, polyfillError, source);

      // Return polyfill result (preparing for deprecation)
      if (polyfillError) throw polyfillError;
      return polyfillResult;
    }

    transformToFragment(source, output) {
      let nativeResult = null;
      let polyfillResult = null;
      let nativeError = null;
      let polyfillError = null;

      try {
        nativeResult = this._native.transformToFragment(source, output);
      } catch (e) {
        nativeError = e;
      }

      try {
        polyfillResult = this._polyfill.transformToFragment(source, output);
      } catch (e) {
        polyfillError = e;
      }

      this._compareAndLog('transformToFragment', nativeResult, polyfillResult, nativeError, polyfillError, source);

      // Return polyfill result (preparing for deprecation)
      if (polyfillError) throw polyfillError;
      return polyfillResult;
    }

    _compareAndLog(method, nativeResult, polyfillResult, nativeError, polyfillError, source) {
      const serializer = new NativeXMLSerializer();

      // Serialize results for comparison first
      let nativeStr = '';
      let polyfillStr = '';

      if (nativeResult) {
        try {
          if (nativeResult.documentElement) {
            nativeStr = serializer.serializeToString(nativeResult.documentElement);
          } else if (nativeResult.firstChild) {
            nativeStr = serializer.serializeToString(nativeResult);
          }
        } catch (e) {
          nativeStr = '[serialization error]';
        }
      }

      if (polyfillResult) {
        try {
          if (polyfillResult.documentElement) {
            polyfillStr = serializer.serializeToString(polyfillResult.documentElement);
          } else if (polyfillResult.firstChild) {
            polyfillStr = serializer.serializeToString(polyfillResult);
          }
        } catch (e) {
          polyfillStr = '[serialization error]';
        }
      }

      const hasDifference = nativeStr !== polyfillStr || nativeError || polyfillError;

      // Only log if there's a mismatch
      if (hasDifference) {
        console.group(`[XSLT Comparison] ${method} - ⚠️ MISMATCH`);

        // Log source XML only on mismatch
        if (source) {
          try {
            const sourceStr = serializer.serializeToString(source);
            console.groupCollapsed('Source XML');
            console.log(sourceStr);
            console.groupEnd();
          } catch (e) {
            console.log('Source XML: [serialization error]', e);
          }
        }

        // Log source XSLT stylesheet only on mismatch
        if (this._stylesheet) {
          try {
            const xsltStr = serializer.serializeToString(this._stylesheet);
            console.groupCollapsed('Source XSLT');
            console.log(xsltStr);
            console.groupEnd();
          } catch (e) {
            console.log('Source XSLT: [serialization error]', e);
          }
        }

        // Log parameters if any
        if (this._params.length > 0) {
          console.groupCollapsed('Parameters');
          this._params.forEach(p => {
            console.log(`${p.localName} = ${p.value}`);
          });
          console.groupEnd();
        }

        // Handle errors
        if (nativeError) {
          console.error('Native error:', nativeError);
        }
        if (polyfillError) {
          console.error('Polyfill error:', polyfillError);
        }

        console.log('Native result:', nativeStr || '(empty)');
        console.log('Polyfill result:', polyfillStr || '(empty)');

        // Show diff details
        if (nativeStr !== polyfillStr) {
          if (nativeStr.length !== polyfillStr.length) {
            console.warn(`Length difference: native=${nativeStr.length}, polyfill=${polyfillStr.length}`);
          }

          // Find first difference position
          for (let i = 0; i < Math.max(nativeStr.length, polyfillStr.length); i++) {
            if (nativeStr[i] !== polyfillStr[i]) {
              const context = 50;
              const start = Math.max(0, i - context);
              const end = Math.min(Math.max(nativeStr.length, polyfillStr.length), i + context);
              console.warn(`First difference at position ${i}:`);
              console.warn(`  Native:   ...${nativeStr.substring(start, end)}...`);
              console.warn(`  Polyfill: ...${polyfillStr.substring(start, end)}...`);
              break;
            }
          }
        }

        console.groupEnd();
      } else {
        console.log(`[XSLT Comparison] ${method} - ✓ Results match`);
      }
    }
  }

  // Replace global XSLTProcessor with comparison wrapper
  window.XSLTProcessor = ComparisonXSLTProcessor;
  console.log('[XSLT Comparison] Comparison mode enabled - transforms will be logged and compared');
}

// Wait for polyfill to load, then set up comparison
function setupComparisonMode() {
  // The polyfill loads after content.js, so we need to wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(createComparisonWrapper, 0);
    });
  } else {
    setTimeout(createComparisonWrapper, 0);
  }
}

setupComparisonMode();

// === END XSLT COMPARISON MODE ===

window.xsltUsePolyfillAlways = true;
// Immediately-invoked function to start the process.
(function initTransform() {
  //let nativeSupported = ('XSLTProcessor' in window) && window.XSLTProcessor.toString().includes('native code');
  //if (nativeSupported) {
  //  try {
  //    new XSLTProcessor();
  //  } catch {
  //    nativeSupported = false;
  //  }
  //}
  //if (nativeSupported) {
  //  console.log('Not running the XSLT polyfill extension because this browser supports native XSLT.');
  //  return;
  //}

  //if (document.location.protocol === 'file:') {
  //  console.log('XSLT polyfill extension: Fetching from file:// URLs is not supported by this extension.');
  //  return;
  //}

  // Step 1: Immediately hide the document to prevent FOUC.
  setHidden(true);

  // Step 2: Asynchronously fetch and process the document.
  fetchAndTransform().catch(error => {
    // Catch any errors, log them, and ensure the document is visible.
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.log('XSLT polyfill extension: Unable to load the site via fetch. This can happen with local files (file://) or due to network errors.');
    } else {
        console.error('Error during XSLT transformation:', error);
    }
    setHidden(false); // Error - stop. Make things visible again.
  });
})();

async function fetchAndTransform() {
  const response = await fetch(document.location.href);
  if (!response.ok) {
    setHidden(false); // Error - stop. Make things visible again.
    console.warn(`XSLT Polyfill: Failed to fetch document: ${response.statusText}`);
    return;
  }
  const xmlBytes = new Uint8Array(await response.arrayBuffer());

  // Decode a small chunk to check for the processing instruction.
  const decoder = new TextDecoder();
  const textChunk = decoder.decode(xmlBytes.subarray(0, 2048));

  if (textChunk.includes('<?xml-stylesheet')) {
    // PI found, proceed with transformation. The page is already hidden.
    // The polyfill's replaceDoc function will handle revealing the new content.
    try {
      await xsltPolyfillReady();
      await loadXmlWithXsltFromBytes(xmlBytes, document.location.href);
    } catch (err) {
      console.error(`Error displaying XML file: ${err.message || err.toString()}`);
    }
    console.log('XSLT Polyfill has transformed this document.');
  }
  setHidden(false);
}

function setHidden(hidden) {
  // This function needs to be robust since it's called very early at document_start.
  if (!document.body) {
    // If the body doesn't exist yet, use animation frames.
    // If we're hiding, schedule it. If we're un-hiding, cancel the scheduled hide.
    if (hidden) {
      xslt_ext_hideRequestId = requestAnimationFrame(() => setHidden(true));
    } else {
      cancelAnimationFrame(xslt_ext_hideRequestId);
    }
    return;
  }

  // Once the body exists, we can act on it directly.
  // Also cancel any pending hide request just in case.
  cancelAnimationFrame(xslt_ext_hideRequestId);
  document.body.style.display = hidden ? 'none' : '';
}

// Global settings for the polyfill script.
window.xsltPolyfillQuiet = true;
window.xsltDontAutoloadXmlDocs = true;
