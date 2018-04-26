// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [function($0) { return window.MbedJSHal.network.get_mac_address(); },
 function($0) { return window.MbedJSHal.network.get_ip_address(); },
 function($0) { return window.MbedJSHal.network.get_netmask(); },
 function($0) { return window.MbedJSHal.network.socket_open($0); },
 function($0) { return window.MbedJSHal.network.socket_close($0); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_connect($0, $1, $2); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_send($0, $1, $2); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_recv($0, $1, $2); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 7584;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "ntp.js.mem";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
    }

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___gxx_personality_v0() {
    }

  function ___lock() {}

  
    

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

  function _abort() {
      Module['abort']();
    }

   

   

  
  var ___tm_current=STATICTOP; STATICTOP += 48;;
  
  
  
  var ___tm_timezone=allocate(intArrayFromString("GMT"), "i8", ALLOC_STATIC);
  
  
  var _tzname=STATICTOP; STATICTOP += 16;;
  
  var _daylight=STATICTOP; STATICTOP += 16;;
  
  var _timezone=STATICTOP; STATICTOP += 16;;function _tzset() {
      // TODO: Use (malleable) environment variables instead of system settings.
      if (_tzset.called) return;
      _tzset.called = true;
  
      // timezone is specified as seconds west of UTC ("The external variable
      // `timezone` shall be set to the difference, in seconds, between
      // Coordinated Universal Time (UTC) and local standard time."), the same
      // as returned by getTimezoneOffset().
      // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
      HEAP32[((_timezone)>>2)]=(new Date()).getTimezoneOffset() * 60;
  
      var winter = new Date(2000, 0, 1);
      var summer = new Date(2000, 6, 1);
      HEAP32[((_daylight)>>2)]=Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
  
      function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT";
      };
      var winterName = extractZone(winter);
      var summerName = extractZone(summer);
      var winterNamePtr = allocate(intArrayFromString(winterName), 'i8', ALLOC_NORMAL);
      var summerNamePtr = allocate(intArrayFromString(summerName), 'i8', ALLOC_NORMAL);
      if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        // Northern hemisphere
        HEAP32[((_tzname)>>2)]=winterNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=summerNamePtr;
      } else {
        HEAP32[((_tzname)>>2)]=summerNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=winterNamePtr;
      }
    }function _localtime_r(time, tmPtr) {
      _tzset();
      var date = new Date(HEAP32[((time)>>2)]*1000);
      HEAP32[((tmPtr)>>2)]=date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)]=date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)]=date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)]=date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)]=date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)]=date.getFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)]=date.getDay();
  
      var start = new Date(date.getFullYear(), 0, 1);
      var yday = ((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))|0;
      HEAP32[(((tmPtr)+(28))>>2)]=yday;
      HEAP32[(((tmPtr)+(36))>>2)]=-(date.getTimezoneOffset() * 60);
  
      // Attention: DST is in December in South, and some regions don't have DST at all.
      var summerOffset = new Date(2000, 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset))|0;
      HEAP32[(((tmPtr)+(32))>>2)]=dst;
  
      var zonePtr = HEAP32[(((_tzname)+(dst ? 4 : 0))>>2)];
      HEAP32[(((tmPtr)+(40))>>2)]=zonePtr;
  
      return tmPtr;
    }
  
  
  var ___tm_formatted=STATICTOP; STATICTOP += 48;;
  
  function _mktime(tmPtr) {
      _tzset();
      var date = new Date(HEAP32[(((tmPtr)+(20))>>2)] + 1900,
                          HEAP32[(((tmPtr)+(16))>>2)],
                          HEAP32[(((tmPtr)+(12))>>2)],
                          HEAP32[(((tmPtr)+(8))>>2)],
                          HEAP32[(((tmPtr)+(4))>>2)],
                          HEAP32[((tmPtr)>>2)],
                          0);
  
      // There's an ambiguous hour when the time goes back; the tm_isdst field is
      // used to disambiguate it.  Date() basically guesses, so we fix it up if it
      // guessed wrong, or fill in tm_isdst with the guess if it's -1.
      var dst = HEAP32[(((tmPtr)+(32))>>2)];
      var guessedOffset = date.getTimezoneOffset();
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(2000, 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dstOffset = Math.min(winterOffset, summerOffset); // DST is in December in South
      if (dst < 0) {
        // Attention: some regions don't have DST at all.
        HEAP32[(((tmPtr)+(32))>>2)]=Number(summerOffset != winterOffset && dstOffset == guessedOffset);
      } else if ((dst > 0) != (dstOffset == guessedOffset)) {
        var nonDstOffset = Math.max(winterOffset, summerOffset);
        var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
        // Don't try setMinutes(date.getMinutes() + ...) -- it's messed up.
        date.setTime(date.getTime() + (trueOffset - guessedOffset)*60000);
      }
  
      HEAP32[(((tmPtr)+(24))>>2)]=date.getDay();
      var yday = ((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))|0;
      HEAP32[(((tmPtr)+(28))>>2)]=yday;
  
      return (date.getTime() / 1000)|0;
    }function _asctime_r(tmPtr, buf) {
      var date = {
        tm_sec: HEAP32[((tmPtr)>>2)],
        tm_min: HEAP32[(((tmPtr)+(4))>>2)],
        tm_hour: HEAP32[(((tmPtr)+(8))>>2)],
        tm_mday: HEAP32[(((tmPtr)+(12))>>2)],
        tm_mon: HEAP32[(((tmPtr)+(16))>>2)],
        tm_year: HEAP32[(((tmPtr)+(20))>>2)],
        tm_wday: HEAP32[(((tmPtr)+(24))>>2)]
      };
      var days = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];
      var months = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
      var s = days[date.tm_wday] + ' ' + months[date.tm_mon] +
          (date.tm_mday < 10 ? '  ' : ' ') + date.tm_mday +
          (date.tm_hour < 10 ? ' 0' : ' ') + date.tm_hour +
          (date.tm_min < 10 ? ':0' : ':') + date.tm_min +
          (date.tm_sec < 10 ? ':0' : ':') + date.tm_sec +
          ' ' + (1900 + date.tm_year) + "\n";
  
      // asctime_r is specced to behave in an undefined manner if the algorithm would attempt
      // to write out more than 26 bytes (including the null terminator).
      // See http://pubs.opengroup.org/onlinepubs/9699919799/functions/asctime.html
      // Our undefined behavior is to truncate the write to at most 26 bytes, including null terminator.
      stringToUTF8(s, buf, 26);
      return buf;
    }function _ctime_r(time, buf) {
      var stack = stackSave();
      var rv = _asctime_r(_localtime_r(time, stackAlloc(44)), buf);
      stackRestore(stack);
      return rv;
    }function _ctime(timer) {
      return _ctime_r(timer, ___tm_current);
    }

  
  var ___async_cur_frame=0; 

  var _emscripten_asm_const_int=true;

   

   

  
  
  var ___async=0;
  
  var ___async_unwind=1;
  
  var ___async_retval=STATICTOP; STATICTOP += 16;; 
  
  
  
  function _emscripten_set_main_loop_timing(mode, value) {
      Browser.mainLoop.timingMode = mode;
      Browser.mainLoop.timingValue = value;
  
      if (!Browser.mainLoop.func) {
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
        Browser.mainLoop.method = 'timeout';
      } else if (mode == 1 /*EM_TIMING_RAF*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
          Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'rAF';
      } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
        if (typeof setImmediate === 'undefined') {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = 'setimmediate';
          function Browser_setImmediate_messageHandler(event) {
            // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
            // so check for both cases.
            if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          addEventListener("message", Browser_setImmediate_messageHandler, true);
          setImmediate = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            if (ENVIRONMENT_IS_WORKER) {
              if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
              Module['setImmediates'].push(func);
              postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
            } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          setImmediate(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }
  
  function _emscripten_get_now() { abort() }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
      Module['noExitRuntime'] = true;
  
      assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  
      Browser.mainLoop.func = func;
      Browser.mainLoop.arg = arg;
  
      var browserIterationFunc;
      if (typeof arg !== 'undefined') {
        browserIterationFunc = function() {
          Module['dynCall_vi'](func, arg);
        };
      } else {
        browserIterationFunc = function() {
          Module['dynCall_v'](func);
        };
      }
  
      var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  
      Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = Browser.mainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (Browser.mainLoop.remainingBlockers) {
            var remaining = Browser.mainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              Browser.mainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
          Browser.mainLoop.updateStatus();
          
          // catches pause/resume main loop from blocker execution
          if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
          
          setTimeout(Browser.mainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Implement very basic swap interval control
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          Browser.mainLoop.scheduler();
          return;
        } else if (Browser.mainLoop.timingMode == 0/*EM_TIMING_SETTIMEOUT*/) {
          Browser.mainLoop.tickStartTime = _emscripten_get_now();
        }
  
        // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
        // VBO double-buffering and reduce GPU stalls.
  
  
        if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
          Module.printErr('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          Browser.mainLoop.method = ''; // just warn once per call to set main loop
        }
  
        Browser.mainLoop.runIter(browserIterationFunc);
  
        checkStackCookie();
  
        // catch pauses from the main loop itself
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
        // to queue the newest produced audio samples.
        // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
        //       do not need to be hardcoded into this function, but can be more generic.
        if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
  
        Browser.mainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
        else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)
  
        Browser.mainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'SimulateInfiniteLoop';
      }
    }var Browser={mainLoop:{scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function () {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++; // Incrementing this signals the previous main loop that it's now become old, and it must return.
        },resume:function () {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true /* do not set timing and call scheduler, we will do it on the next lines */);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        },runIter:function (func) {
          if (ABORT) return;
          if (Module['preMainLoop']) {
            var preRet = Module['preMainLoop']();
            if (preRet === false) {
              return; // |return false| skips a frame
            }
          }
          try {
            func();
          } catch (e) {
            if (e instanceof ExitStatus) {
              return;
            } else {
              if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
              throw e;
            }
          }
          if (Module['postMainLoop']) Module['postMainLoop']();
        }},isFullscreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers
  
        if (Browser.initted) return;
        Browser.initted = true;
  
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
          console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
          Module.noImageDecoding = true;
        }
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              if (b.size !== byteArray.length) { // Safari bug #118630
                // Safari's Blob can only take an ArrayBuffer
                b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
              }
            } catch(e) {
              warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
          var img = new Image();
          img.onload = function img_onload() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function img_onerror(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function audio_onerror(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            Browser.safeSetTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
  
        // Canvas event setup
  
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
                                document['mozPointerLockElement'] === Module['canvas'] ||
                                document['webkitPointerLockElement'] === Module['canvas'] ||
                                document['msPointerLockElement'] === Module['canvas'];
        }
        var canvas = Module['canvas'];
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
          
          canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                      canvas['mozRequestPointerLock'] ||
                                      canvas['webkitRequestPointerLock'] ||
                                      canvas['msRequestPointerLock'] ||
                                      function(){};
          canvas.exitPointerLock = document['exitPointerLock'] ||
                                   document['mozExitPointerLock'] ||
                                   document['webkitExitPointerLock'] ||
                                   document['msExitPointerLock'] ||
                                   function(){}; // no-op if function does not exist
          canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
  
          document.addEventListener('pointerlockchange', pointerLockChange, false);
          document.addEventListener('mozpointerlockchange', pointerLockChange, false);
          document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
          document.addEventListener('mspointerlockchange', pointerLockChange, false);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener("click", function(ev) {
              if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
                Module['canvas'].requestPointerLock();
                ev.preventDefault();
              }
            }, false);
          }
        }
      },createContext:function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx === 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
  
          Module.ctx = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullscreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullscreen:function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
  
        var canvas = Module['canvas'];
        function fullscreenChange() {
          Browser.isFullscreen = false;
          var canvasContainer = canvas.parentNode;
          if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
               document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
               document['webkitCurrentFullScreenElement']) === canvasContainer) {
            canvas.exitFullscreen = document['exitFullscreen'] ||
                                    document['cancelFullScreen'] ||
                                    document['mozCancelFullScreen'] ||
                                    document['msExitFullscreen'] ||
                                    document['webkitCancelFullScreen'] ||
                                    function() {};
            canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullscreen = true;
            if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize();
          } else {
            
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
            
            if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
          if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
          Browser.updateCanvasDimensions(canvas);
        }
  
        if (!Browser.fullscreenHandlersInstalled) {
          Browser.fullscreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullscreenChange, false);
          document.addEventListener('mozfullscreenchange', fullscreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
          document.addEventListener('MSFullscreenChange', fullscreenChange, false);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
                                            canvasContainer['mozRequestFullScreen'] ||
                                            canvasContainer['msRequestFullscreen'] ||
                                           (canvasContainer['webkitRequestFullscreen'] ? function() { canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null) ||
                                           (canvasContainer['webkitRequestFullScreen'] ? function() { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
  
        if (vrDevice) {
          canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
        } else {
          canvasContainer.requestFullscreen();
        }
      },requestFullScreen:function (lockPointer, resizeCanvas, vrDevice) {
          Module.printErr('Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.');
          Browser.requestFullScreen = function(lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
          }
          return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
      },nextRAF:0,fakeRequestAnimationFrame:function (func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (Browser.nextRAF === 0) {
          Browser.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            Browser.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
      },requestAnimationFrame:function requestAnimationFrame(func) {
        if (typeof window === 'undefined') { // Provide fallback to setTimeout if window is undefined (e.g. in Node.js)
          Browser.fakeRequestAnimationFrame(func);
        } else {
          if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                           window['mozRequestAnimationFrame'] ||
                                           window['webkitRequestAnimationFrame'] ||
                                           window['msRequestAnimationFrame'] ||
                                           window['oRequestAnimationFrame'] ||
                                           Browser.fakeRequestAnimationFrame;
          }
          window.requestAnimationFrame(func);
        }
      },safeCallback:function (func) {
        return function() {
          if (!ABORT) return func.apply(null, arguments);
        };
      },allowAsyncCallbacks:true,queuedAsyncCallbacks:[],pauseAsyncCallbacks:function () {
        Browser.allowAsyncCallbacks = false;
      },resumeAsyncCallbacks:function () { // marks future callbacks as ok to execute, and synchronously runs any remaining ones right now
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
          var callbacks = Browser.queuedAsyncCallbacks;
          Browser.queuedAsyncCallbacks = [];
          callbacks.forEach(function(func) {
            func();
          });
        }
      },safeRequestAnimationFrame:function (func) {
        return Browser.requestAnimationFrame(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        });
      },safeSetTimeout:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setTimeout(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        }, timeout);
      },safeSetInterval:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setInterval(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } // drop it on the floor otherwise, next interval will kick in
        }, timeout);
      },getMimetype:function (name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.substr(name.lastIndexOf('.')+1)];
      },getUserMedia:function (func) {
        if(!window.getUserMedia) {
          window.getUserMedia = navigator['getUserMedia'] ||
                                navigator['mozGetUserMedia'];
        }
        window.getUserMedia(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },getMouseWheelDelta:function (event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll': 
            delta = event.detail;
            break;
          case 'mousewheel': 
            delta = event.wheelDelta;
            break;
          case 'wheel': 
            delta = event['deltaY'];
            break;
          default:
            throw 'unrecognized mouse wheel event: ' + event.type;
        }
        return delta;
      },mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function (event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          // Workaround for Firefox bug 764498
          if (event.type != 'mousemove' &&
              ('mozMovementX' in event)) {
            Browser.mouseMovementX = Browser.mouseMovementY = 0;
          } else {
            Browser.mouseMovementX = Browser.getMovementX(event);
            Browser.mouseMovementY = Browser.getMovementY(event);
          }
          
          // check if SDL is available
          if (typeof SDL != "undefined") {
            Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
            Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
          } else {
            // just add the mouse delta to the current absolut mouse position
            // FIXME: ideally this should be clamped against the canvas size and zero
            Browser.mouseX += Browser.mouseMovementX;
            Browser.mouseY += Browser.mouseMovementY;
          }        
        } else {
          // Otherwise, calculate the movement based on the changes
          // in the coordinates.
          var rect = Module["canvas"].getBoundingClientRect();
          var cw = Module["canvas"].width;
          var ch = Module["canvas"].height;
  
          // Neither .scrollX or .pageXOffset are defined in a spec, but
          // we prefer .scrollX because it is currently in a spec draft.
          // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
          var scrollX = ((typeof window.scrollX !== 'undefined') ? window.scrollX : window.pageXOffset);
          var scrollY = ((typeof window.scrollY !== 'undefined') ? window.scrollY : window.pageYOffset);
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the "touch" property is only defined in SDL
  
            }
            var adjustedX = touch.pageX - (scrollX + rect.left);
            var adjustedY = touch.pageY - (scrollY + rect.top);
  
            adjustedX = adjustedX * (cw / rect.width);
            adjustedY = adjustedY * (ch / rect.height);
  
            var coords = { x: adjustedX, y: adjustedY };
            
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              if (!last) last = coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            } 
            return;
          }
  
          var x = event.pageX - (scrollX + rect.left);
          var y = event.pageY - (scrollY + rect.top);
  
          // the canvas might be CSS-scaled compared to its backbuffer;
          // SDL-using content will want mouse coordinates in terms
          // of backbuffer units.
          x = x * (cw / rect.width);
          y = y * (ch / rect.height);
  
          Browser.mouseMovementX = x - Browser.mouseX;
          Browser.mouseMovementY = y - Browser.mouseY;
          Browser.mouseX = x;
          Browser.mouseY = y;
        }
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
        Module['readAsync'](url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (dep) addRunDependency(dep);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullscreenCanvasSize:function () {
        // check if SDL is available   
        if (typeof SDL != "undefined") {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },updateCanvasDimensions:function (canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
          if (w/h < Module['forcedAspectRatio']) {
            w = Math.round(h * Module['forcedAspectRatio']);
          } else {
            h = Math.round(w / Module['forcedAspectRatio']);
          }
        }
        if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
             document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
             document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( "width");
            canvas.style.removeProperty("height");
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( "width", w + "px", "important");
              canvas.style.setProperty("height", h + "px", "important");
            } else {
              canvas.style.removeProperty( "width");
              canvas.style.removeProperty("height");
            }
          }
        }
      },wgetRequests:{},nextWgetRequestHandle:0,getNextWgetRequestHandle:function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
      }};function _emscripten_sleep(ms) {
      Module['setAsync'](); // tell the scheduler that we have a callback on hold
      Browser.safeSetTimeout(_emscripten_async_resume, ms);
    }



   

  function _llvm_trap() {
      abort('trap!');
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead."); Module["requestFullScreen"] = Module["requestFullscreen"]; Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (typeof self === 'object' && self['performance'] && typeof self['performance']['now'] === 'function') {
    _emscripten_get_now = function() { return self['performance']['now'](); };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function() { return performance['now'](); };
  } else {
    _emscripten_get_now = Date.now;
  };
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}



var debug_table_ii = ["0", "__ZN17EthernetInterface15get_mac_addressEv", "__ZN17EthernetInterface14get_ip_addressEv", "__ZN17EthernetInterface11get_netmaskEv", "__ZN17EthernetInterface11get_gatewayEv", "__ZN17EthernetInterface7connectEv", "__ZN17EthernetInterface10disconnectEv", "__ZNK16NetworkInterface21get_connection_statusEv", "__ZN17EthernetInterface9get_stackEv", "__ZThn4_N17EthernetInterface14get_ip_addressEv", "__ZN9UDPSocket9get_protoEv", "___stdio_close", "0", "0", "0", "0"];
var debug_table_iii = ["0", "__ZN17EthernetInterface8set_dhcpEb", "__ZN16NetworkInterface14add_dns_serverERK13SocketAddress", "__ZN16NetworkInterface12set_blockingEb", "__ZN17EthernetInterface12socket_closeEPv", "__ZN12NetworkStack14add_dns_serverERK13SocketAddress", "__ZThn4_N17EthernetInterface12socket_closeEPv", "0"];
var debug_table_iiii = ["0", "__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol", "__ZN17EthernetInterface11socket_bindEPvRK13SocketAddress", "__ZN17EthernetInterface13socket_listenEPvi", "__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress", "__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol", "__ZThn4_N17EthernetInterface11socket_bindEPvRK13SocketAddress", "__ZThn4_N17EthernetInterface13socket_listenEPvi", "__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "_do_read", "0"];
var debug_table_iiiii = ["0", "__ZN17EthernetInterface11set_networkEPKcS1_S1_", "__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version", "__ZN17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress", "__ZN17EthernetInterface11socket_sendEPvPKvj", "__ZN17EthernetInterface11socket_recvEPvS0_j", "__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version", "__ZThn4_N17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress", "__ZThn4_N17EthernetInterface11socket_sendEPvPKvj", "__ZThn4_N17EthernetInterface11socket_recvEPvS0_j", "0", "0", "0", "0", "0", "0"];
var debug_table_iiiiii = ["0", "__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj", "__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j", "__ZN12NetworkStack11setstackoptEiiPKvj", "__ZN12NetworkStack11getstackoptEiiPvPj", "__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj", "__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j", "0"];
var debug_table_iiiiiii = ["0", "__ZN12NetworkStack10setsockoptEPviiPKvj", "__ZN12NetworkStack10getsockoptEPviiS0_Pj", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "__ZL25default_terminate_handlerv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev"];
var debug_table_vi = ["0", "__ZN17EthernetInterfaceD2Ev", "__ZN17EthernetInterfaceD0Ev", "__ZThn4_N17EthernetInterfaceD1Ev", "__ZThn4_N17EthernetInterfaceD0Ev", "__ZN6SocketD2Ev", "__ZN6SocketD0Ev", "__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorINS2_14method_contextI6SocketMS5_FvvEEEEEvPv", "__ZN9UDPSocketD2Ev", "__ZN9UDPSocketD0Ev", "__ZN9UDPSocket5eventEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN17EthernetInterface15get_mac_addressEv__async_cb", "__ZN17EthernetInterface14get_ip_addressEv__async_cb", "__ZN17EthernetInterface11get_netmaskEv__async_cb", "__ZN17EthernetInterface11set_networkEPKcS1_S1___async_cb", "__ZN17EthernetInterface8set_dhcpEb__async_cb", "__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb", "__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_44", "__ZN17EthernetInterface12socket_closeEPv__async_cb", "__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb", "__ZN17EthernetInterface11socket_sendEPvPKvj__async_cb", "__ZN17EthernetInterface11socket_recvEPvS0_j__async_cb", "__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_49", "__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb", "__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_50", "__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_48", "__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb", "__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_84", "__ZThn4_N17EthernetInterface14get_ip_addressEv__async_cb", "__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb", "__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_6", "__ZThn4_N17EthernetInterface12socket_closeEPv__async_cb", "__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb", "__ZThn4_N17EthernetInterface11socket_sendEPvPKvj__async_cb", "__ZThn4_N17EthernetInterface11socket_recvEPvS0_j__async_cb", "__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_8", "__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb", "__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_9", "__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_7", "__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb", "__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_45", "__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb", "__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_1", "__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb", "__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb_3", "__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb", "__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_51", "__ZN6SocketD2Ev__async_cb", "__ZN6SocketD2Ev__async_cb_52", "__ZN6Socket4openEP12NetworkStack__async_cb", "__ZN6Socket4openEP12NetworkStack__async_cb_39", "__ZN6Socket4openEP12NetworkStack__async_cb_40", "__ZN6Socket4openEP12NetworkStack__async_cb_41", "__ZN6Socket4openEP12NetworkStack__async_cb_42", "__ZN4mbed8CallbackIFvvEE5thunkEPv", "__ZN6Socket4openEP12NetworkStack__async_cb_43", "__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb_10", "__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv__async_cb", "__ZN6Socket5closeEv__async_cb", "__ZN6Socket5closeEv__async_cb_75", "__ZN6Socket5closeEv__async_cb_76", "__ZN9UDPSocketD2Ev__async_cb_47", "__ZN9UDPSocketD2Ev__async_cb", "__ZN9UDPSocketD2Ev__async_cb_46", "__ZN9UDPSocketD0Ev__async_cb", "__ZN9UDPSocket5eventEv__async_cb", "__ZN9UDPSocket6sendtoEPKctPKvj__async_cb", "__ZN9UDPSocket6sendtoEPKctPKvj__async_cb_72", "__ZN9UDPSocket6sendtoERK13SocketAddressPKvj__async_cb", "__ZN9UDPSocket8recvfromEP13SocketAddressPvj__async_cb", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_34", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_31", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_26", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_33", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_32", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_30", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_25", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_29", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_24", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_28", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_23", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_27", "__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb", "__Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_67", "_mbed_die__async_cb_66", "_mbed_die__async_cb_65", "_mbed_die__async_cb_64", "_mbed_die__async_cb_63", "_mbed_die__async_cb_62", "_mbed_die__async_cb_61", "_mbed_die__async_cb_60", "_mbed_die__async_cb_59", "_mbed_die__async_cb_58", "_mbed_die__async_cb_57", "_mbed_die__async_cb_56", "_mbed_die__async_cb_55", "_mbed_die__async_cb_54", "_mbed_die__async_cb_53", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_22", "_serial_putc__async_cb_5", "_serial_putc__async_cb", "_invoke_ticker__async_cb_21", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb_11", "_main__async_cb", "_main__async_cb_20", "_main__async_cb_12", "_main__async_cb_14", "_main__async_cb_19", "_main__async_cb_13", "_main__async_cb_18", "_main__async_cb_16", "_main__async_cb_17", "_main__async_cb_15", "__ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb", "__ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb_37", "_putc__async_cb_36", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_81", "_fflush__async_cb_80", "_fflush__async_cb_82", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_74", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_printf__async_cb", "_fputc__async_cb_35", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_78", "_abort_message__async_cb", "_abort_message__async_cb_79", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_73", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_83", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_77", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_4", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN16NetworkInterface6attachEN4mbed8CallbackIFv11nsapi_eventiEEE", "__ZN4mbed8CallbackIFvvEE13function_moveINS2_14method_contextI6SocketMS5_FvvEEEEEvPvPKv", "0"];
var debug_table_viiii = ["0", "__ZN17EthernetInterface13socket_attachEPvPFvS0_ES0_", "__ZThn4_N17EthernetInterface13socket_attachEPvPFvS0_ES0_", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0", "0"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  v: " + debug_table_v[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iiiii: " + debug_table_iiiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiii(index,a1,a2,a3,a4) {
  try {
    return Module["dynCall_iiiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiii(index,a1,a2,a3,a4,a5) {
  try {
    return Module["dynCall_iiiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    return Module["dynCall_iiiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iii": nullFunc_iii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_iiiii": nullFunc_iiiii, "nullFunc_iiiiii": nullFunc_iiiiii, "nullFunc_iiiiiii": nullFunc_iiiiiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiii": invoke_iiiii, "invoke_iiiiii": invoke_iiiiii, "invoke_iiiiiii": invoke_iiiiiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_asctime_r": _asctime_r, "_ctime": _ctime, "_ctime_r": _ctime_r, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_localtime_r": _localtime_r, "_mktime": _mktime, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "_tzset": _tzset, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;
  var ___async=env.___async|0;
  var ___async_unwind=env.___async_unwind|0;
  var ___async_retval=env.___async_retval|0;
  var ___async_cur_frame=env.___async_cur_frame|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_iiiii=env.nullFunc_iiiii;
  var nullFunc_iiiiii=env.nullFunc_iiiiii;
  var nullFunc_iiiiiii=env.nullFunc_iiiiiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iii=env.invoke_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_iiiii=env.invoke_iiiii;
  var invoke_iiiiii=env.invoke_iiiiii;
  var invoke_iiiiiii=env.invoke_iiiiiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _asctime_r=env._asctime_r;
  var _ctime=env._ctime;
  var _ctime_r=env._ctime_r;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var _llvm_trap=env._llvm_trap;
  var _localtime_r=env._localtime_r;
  var _mktime=env._mktime;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var _tzset=env._tzset;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 5483
 STACKTOP = STACKTOP + 16 | 0; //@line 5484
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5484
 $1 = sp; //@line 5485
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 5492
   $7 = $6 >>> 3; //@line 5493
   $8 = HEAP32[1487] | 0; //@line 5494
   $9 = $8 >>> $7; //@line 5495
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 5501
    $16 = 5988 + ($14 << 1 << 2) | 0; //@line 5503
    $17 = $16 + 8 | 0; //@line 5504
    $18 = HEAP32[$17 >> 2] | 0; //@line 5505
    $19 = $18 + 8 | 0; //@line 5506
    $20 = HEAP32[$19 >> 2] | 0; //@line 5507
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1487] = $8 & ~(1 << $14); //@line 5514
     } else {
      if ((HEAP32[1491] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 5519
      }
      $27 = $20 + 12 | 0; //@line 5522
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 5526
       HEAP32[$17 >> 2] = $20; //@line 5527
       break;
      } else {
       _abort(); //@line 5530
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 5535
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 5538
    $34 = $18 + $30 + 4 | 0; //@line 5540
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 5543
    $$0 = $19; //@line 5544
    STACKTOP = sp; //@line 5545
    return $$0 | 0; //@line 5545
   }
   $37 = HEAP32[1489] | 0; //@line 5547
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 5553
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 5556
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 5559
     $49 = $47 >>> 12 & 16; //@line 5561
     $50 = $47 >>> $49; //@line 5562
     $52 = $50 >>> 5 & 8; //@line 5564
     $54 = $50 >>> $52; //@line 5566
     $56 = $54 >>> 2 & 4; //@line 5568
     $58 = $54 >>> $56; //@line 5570
     $60 = $58 >>> 1 & 2; //@line 5572
     $62 = $58 >>> $60; //@line 5574
     $64 = $62 >>> 1 & 1; //@line 5576
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 5579
     $69 = 5988 + ($67 << 1 << 2) | 0; //@line 5581
     $70 = $69 + 8 | 0; //@line 5582
     $71 = HEAP32[$70 >> 2] | 0; //@line 5583
     $72 = $71 + 8 | 0; //@line 5584
     $73 = HEAP32[$72 >> 2] | 0; //@line 5585
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 5591
       HEAP32[1487] = $77; //@line 5592
       $98 = $77; //@line 5593
      } else {
       if ((HEAP32[1491] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 5598
       }
       $80 = $73 + 12 | 0; //@line 5601
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 5605
        HEAP32[$70 >> 2] = $73; //@line 5606
        $98 = $8; //@line 5607
        break;
       } else {
        _abort(); //@line 5610
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 5615
     $84 = $83 - $6 | 0; //@line 5616
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 5619
     $87 = $71 + $6 | 0; //@line 5620
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 5623
     HEAP32[$71 + $83 >> 2] = $84; //@line 5625
     if ($37 | 0) {
      $92 = HEAP32[1492] | 0; //@line 5628
      $93 = $37 >>> 3; //@line 5629
      $95 = 5988 + ($93 << 1 << 2) | 0; //@line 5631
      $96 = 1 << $93; //@line 5632
      if (!($98 & $96)) {
       HEAP32[1487] = $98 | $96; //@line 5637
       $$0199 = $95; //@line 5639
       $$pre$phiZ2D = $95 + 8 | 0; //@line 5639
      } else {
       $101 = $95 + 8 | 0; //@line 5641
       $102 = HEAP32[$101 >> 2] | 0; //@line 5642
       if ((HEAP32[1491] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 5646
       } else {
        $$0199 = $102; //@line 5649
        $$pre$phiZ2D = $101; //@line 5649
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 5652
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 5654
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 5656
      HEAP32[$92 + 12 >> 2] = $95; //@line 5658
     }
     HEAP32[1489] = $84; //@line 5660
     HEAP32[1492] = $87; //@line 5661
     $$0 = $72; //@line 5662
     STACKTOP = sp; //@line 5663
     return $$0 | 0; //@line 5663
    }
    $108 = HEAP32[1488] | 0; //@line 5665
    if (!$108) {
     $$0197 = $6; //@line 5668
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 5672
     $114 = $112 >>> 12 & 16; //@line 5674
     $115 = $112 >>> $114; //@line 5675
     $117 = $115 >>> 5 & 8; //@line 5677
     $119 = $115 >>> $117; //@line 5679
     $121 = $119 >>> 2 & 4; //@line 5681
     $123 = $119 >>> $121; //@line 5683
     $125 = $123 >>> 1 & 2; //@line 5685
     $127 = $123 >>> $125; //@line 5687
     $129 = $127 >>> 1 & 1; //@line 5689
     $134 = HEAP32[6252 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 5694
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 5698
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5704
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 5707
      $$0193$lcssa$i = $138; //@line 5707
     } else {
      $$01926$i = $134; //@line 5709
      $$01935$i = $138; //@line 5709
      $146 = $143; //@line 5709
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 5714
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 5715
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 5716
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 5717
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5723
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 5726
        $$0193$lcssa$i = $$$0193$i; //@line 5726
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 5729
        $$01935$i = $$$0193$i; //@line 5729
       }
      }
     }
     $157 = HEAP32[1491] | 0; //@line 5733
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5736
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 5739
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5742
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 5746
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 5748
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 5752
       $176 = HEAP32[$175 >> 2] | 0; //@line 5753
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 5756
        $179 = HEAP32[$178 >> 2] | 0; //@line 5757
        if (!$179) {
         $$3$i = 0; //@line 5760
         break;
        } else {
         $$1196$i = $179; //@line 5763
         $$1198$i = $178; //@line 5763
        }
       } else {
        $$1196$i = $176; //@line 5766
        $$1198$i = $175; //@line 5766
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 5769
        $182 = HEAP32[$181 >> 2] | 0; //@line 5770
        if ($182 | 0) {
         $$1196$i = $182; //@line 5773
         $$1198$i = $181; //@line 5773
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 5776
        $185 = HEAP32[$184 >> 2] | 0; //@line 5777
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 5782
         $$1198$i = $184; //@line 5782
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 5787
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 5790
        $$3$i = $$1196$i; //@line 5791
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 5796
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 5799
       }
       $169 = $167 + 12 | 0; //@line 5802
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 5806
       }
       $172 = $164 + 8 | 0; //@line 5809
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 5813
        HEAP32[$172 >> 2] = $167; //@line 5814
        $$3$i = $164; //@line 5815
        break;
       } else {
        _abort(); //@line 5818
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 5827
       $191 = 6252 + ($190 << 2) | 0; //@line 5828
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 5833
         if (!$$3$i) {
          HEAP32[1488] = $108 & ~(1 << $190); //@line 5839
          break L73;
         }
        } else {
         if ((HEAP32[1491] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 5846
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 5854
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1491] | 0; //@line 5864
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 5867
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 5871
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 5873
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 5879
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 5883
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 5885
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 5891
       if ($214 | 0) {
        if ((HEAP32[1491] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 5897
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 5901
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 5903
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 5911
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 5914
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 5916
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 5919
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 5923
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 5926
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 5928
      if ($37 | 0) {
       $234 = HEAP32[1492] | 0; //@line 5931
       $235 = $37 >>> 3; //@line 5932
       $237 = 5988 + ($235 << 1 << 2) | 0; //@line 5934
       $238 = 1 << $235; //@line 5935
       if (!($8 & $238)) {
        HEAP32[1487] = $8 | $238; //@line 5940
        $$0189$i = $237; //@line 5942
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 5942
       } else {
        $242 = $237 + 8 | 0; //@line 5944
        $243 = HEAP32[$242 >> 2] | 0; //@line 5945
        if ((HEAP32[1491] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 5949
        } else {
         $$0189$i = $243; //@line 5952
         $$pre$phi$iZ2D = $242; //@line 5952
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 5955
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 5957
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 5959
       HEAP32[$234 + 12 >> 2] = $237; //@line 5961
      }
      HEAP32[1489] = $$0193$lcssa$i; //@line 5963
      HEAP32[1492] = $159; //@line 5964
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 5967
     STACKTOP = sp; //@line 5968
     return $$0 | 0; //@line 5968
    }
   } else {
    $$0197 = $6; //@line 5971
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 5976
   } else {
    $251 = $0 + 11 | 0; //@line 5978
    $252 = $251 & -8; //@line 5979
    $253 = HEAP32[1488] | 0; //@line 5980
    if (!$253) {
     $$0197 = $252; //@line 5983
    } else {
     $255 = 0 - $252 | 0; //@line 5985
     $256 = $251 >>> 8; //@line 5986
     if (!$256) {
      $$0358$i = 0; //@line 5989
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 5993
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 5997
       $262 = $256 << $261; //@line 5998
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 6001
       $267 = $262 << $265; //@line 6003
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 6006
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 6011
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 6017
      }
     }
     $282 = HEAP32[6252 + ($$0358$i << 2) >> 2] | 0; //@line 6021
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 6025
       $$3$i203 = 0; //@line 6025
       $$3350$i = $255; //@line 6025
       label = 81; //@line 6026
      } else {
       $$0342$i = 0; //@line 6033
       $$0347$i = $255; //@line 6033
       $$0353$i = $282; //@line 6033
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 6033
       $$0362$i = 0; //@line 6033
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 6038
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 6043
          $$435113$i = 0; //@line 6043
          $$435712$i = $$0353$i; //@line 6043
          label = 85; //@line 6044
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 6047
          $$1348$i = $292; //@line 6047
         }
        } else {
         $$1343$i = $$0342$i; //@line 6050
         $$1348$i = $$0347$i; //@line 6050
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 6053
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 6056
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 6060
        $302 = ($$0353$i | 0) == 0; //@line 6061
        if ($302) {
         $$2355$i = $$1363$i; //@line 6066
         $$3$i203 = $$1343$i; //@line 6066
         $$3350$i = $$1348$i; //@line 6066
         label = 81; //@line 6067
         break;
        } else {
         $$0342$i = $$1343$i; //@line 6070
         $$0347$i = $$1348$i; //@line 6070
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 6070
         $$0362$i = $$1363$i; //@line 6070
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 6080
       $309 = $253 & ($306 | 0 - $306); //@line 6083
       if (!$309) {
        $$0197 = $252; //@line 6086
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 6091
       $315 = $313 >>> 12 & 16; //@line 6093
       $316 = $313 >>> $315; //@line 6094
       $318 = $316 >>> 5 & 8; //@line 6096
       $320 = $316 >>> $318; //@line 6098
       $322 = $320 >>> 2 & 4; //@line 6100
       $324 = $320 >>> $322; //@line 6102
       $326 = $324 >>> 1 & 2; //@line 6104
       $328 = $324 >>> $326; //@line 6106
       $330 = $328 >>> 1 & 1; //@line 6108
       $$4$ph$i = 0; //@line 6114
       $$4357$ph$i = HEAP32[6252 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 6114
      } else {
       $$4$ph$i = $$3$i203; //@line 6116
       $$4357$ph$i = $$2355$i; //@line 6116
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 6120
       $$4351$lcssa$i = $$3350$i; //@line 6120
      } else {
       $$414$i = $$4$ph$i; //@line 6122
       $$435113$i = $$3350$i; //@line 6122
       $$435712$i = $$4357$ph$i; //@line 6122
       label = 85; //@line 6123
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 6128
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 6132
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 6133
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 6134
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 6135
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 6141
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 6144
        $$4351$lcssa$i = $$$4351$i; //@line 6144
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 6147
        $$435113$i = $$$4351$i; //@line 6147
        label = 85; //@line 6148
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 6154
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1489] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1491] | 0; //@line 6160
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 6163
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 6166
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 6169
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 6173
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 6175
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 6179
         $371 = HEAP32[$370 >> 2] | 0; //@line 6180
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 6183
          $374 = HEAP32[$373 >> 2] | 0; //@line 6184
          if (!$374) {
           $$3372$i = 0; //@line 6187
           break;
          } else {
           $$1370$i = $374; //@line 6190
           $$1374$i = $373; //@line 6190
          }
         } else {
          $$1370$i = $371; //@line 6193
          $$1374$i = $370; //@line 6193
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 6196
          $377 = HEAP32[$376 >> 2] | 0; //@line 6197
          if ($377 | 0) {
           $$1370$i = $377; //@line 6200
           $$1374$i = $376; //@line 6200
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 6203
          $380 = HEAP32[$379 >> 2] | 0; //@line 6204
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 6209
           $$1374$i = $379; //@line 6209
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 6214
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 6217
          $$3372$i = $$1370$i; //@line 6218
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 6223
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 6226
         }
         $364 = $362 + 12 | 0; //@line 6229
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 6233
         }
         $367 = $359 + 8 | 0; //@line 6236
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 6240
          HEAP32[$367 >> 2] = $362; //@line 6241
          $$3372$i = $359; //@line 6242
          break;
         } else {
          _abort(); //@line 6245
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 6253
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 6256
         $386 = 6252 + ($385 << 2) | 0; //@line 6257
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 6262
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 6267
            HEAP32[1488] = $391; //@line 6268
            $475 = $391; //@line 6269
            break L164;
           }
          } else {
           if ((HEAP32[1491] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 6276
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 6284
            if (!$$3372$i) {
             $475 = $253; //@line 6287
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1491] | 0; //@line 6295
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 6298
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 6302
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 6304
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 6310
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 6314
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 6316
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 6322
         if (!$409) {
          $475 = $253; //@line 6325
         } else {
          if ((HEAP32[1491] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 6330
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 6334
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 6336
           $475 = $253; //@line 6337
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 6346
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 6349
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 6351
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 6354
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 6358
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 6361
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 6363
         $428 = $$4351$lcssa$i >>> 3; //@line 6364
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5988 + ($428 << 1 << 2) | 0; //@line 6368
          $432 = HEAP32[1487] | 0; //@line 6369
          $433 = 1 << $428; //@line 6370
          if (!($432 & $433)) {
           HEAP32[1487] = $432 | $433; //@line 6375
           $$0368$i = $431; //@line 6377
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 6377
          } else {
           $437 = $431 + 8 | 0; //@line 6379
           $438 = HEAP32[$437 >> 2] | 0; //@line 6380
           if ((HEAP32[1491] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 6384
           } else {
            $$0368$i = $438; //@line 6387
            $$pre$phi$i211Z2D = $437; //@line 6387
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 6390
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 6392
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 6394
          HEAP32[$354 + 12 >> 2] = $431; //@line 6396
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 6399
         if (!$444) {
          $$0361$i = 0; //@line 6402
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 6406
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 6410
           $450 = $444 << $449; //@line 6411
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 6414
           $455 = $450 << $453; //@line 6416
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 6419
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 6424
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 6430
          }
         }
         $469 = 6252 + ($$0361$i << 2) | 0; //@line 6433
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 6435
         $471 = $354 + 16 | 0; //@line 6436
         HEAP32[$471 + 4 >> 2] = 0; //@line 6438
         HEAP32[$471 >> 2] = 0; //@line 6439
         $473 = 1 << $$0361$i; //@line 6440
         if (!($475 & $473)) {
          HEAP32[1488] = $475 | $473; //@line 6445
          HEAP32[$469 >> 2] = $354; //@line 6446
          HEAP32[$354 + 24 >> 2] = $469; //@line 6448
          HEAP32[$354 + 12 >> 2] = $354; //@line 6450
          HEAP32[$354 + 8 >> 2] = $354; //@line 6452
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 6461
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 6461
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 6468
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 6472
          $494 = HEAP32[$492 >> 2] | 0; //@line 6474
          if (!$494) {
           label = 136; //@line 6477
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 6480
           $$0345$i = $494; //@line 6480
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1491] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 6487
          } else {
           HEAP32[$492 >> 2] = $354; //@line 6490
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 6492
           HEAP32[$354 + 12 >> 2] = $354; //@line 6494
           HEAP32[$354 + 8 >> 2] = $354; //@line 6496
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 6501
          $502 = HEAP32[$501 >> 2] | 0; //@line 6502
          $503 = HEAP32[1491] | 0; //@line 6503
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 6509
           HEAP32[$501 >> 2] = $354; //@line 6510
           HEAP32[$354 + 8 >> 2] = $502; //@line 6512
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 6514
           HEAP32[$354 + 24 >> 2] = 0; //@line 6516
           break;
          } else {
           _abort(); //@line 6519
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 6526
       STACKTOP = sp; //@line 6527
       return $$0 | 0; //@line 6527
      } else {
       $$0197 = $252; //@line 6529
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1489] | 0; //@line 6536
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 6539
  $515 = HEAP32[1492] | 0; //@line 6540
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 6543
   HEAP32[1492] = $517; //@line 6544
   HEAP32[1489] = $514; //@line 6545
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 6548
   HEAP32[$515 + $512 >> 2] = $514; //@line 6550
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 6553
  } else {
   HEAP32[1489] = 0; //@line 6555
   HEAP32[1492] = 0; //@line 6556
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 6559
   $526 = $515 + $512 + 4 | 0; //@line 6561
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 6564
  }
  $$0 = $515 + 8 | 0; //@line 6567
  STACKTOP = sp; //@line 6568
  return $$0 | 0; //@line 6568
 }
 $530 = HEAP32[1490] | 0; //@line 6570
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 6573
  HEAP32[1490] = $532; //@line 6574
  $533 = HEAP32[1493] | 0; //@line 6575
  $534 = $533 + $$0197 | 0; //@line 6576
  HEAP32[1493] = $534; //@line 6577
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 6580
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 6583
  $$0 = $533 + 8 | 0; //@line 6585
  STACKTOP = sp; //@line 6586
  return $$0 | 0; //@line 6586
 }
 if (!(HEAP32[1605] | 0)) {
  HEAP32[1607] = 4096; //@line 6591
  HEAP32[1606] = 4096; //@line 6592
  HEAP32[1608] = -1; //@line 6593
  HEAP32[1609] = -1; //@line 6594
  HEAP32[1610] = 0; //@line 6595
  HEAP32[1598] = 0; //@line 6596
  HEAP32[1605] = $1 & -16 ^ 1431655768; //@line 6600
  $548 = 4096; //@line 6601
 } else {
  $548 = HEAP32[1607] | 0; //@line 6604
 }
 $545 = $$0197 + 48 | 0; //@line 6606
 $546 = $$0197 + 47 | 0; //@line 6607
 $547 = $548 + $546 | 0; //@line 6608
 $549 = 0 - $548 | 0; //@line 6609
 $550 = $547 & $549; //@line 6610
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 6613
  STACKTOP = sp; //@line 6614
  return $$0 | 0; //@line 6614
 }
 $552 = HEAP32[1597] | 0; //@line 6616
 if ($552 | 0) {
  $554 = HEAP32[1595] | 0; //@line 6619
  $555 = $554 + $550 | 0; //@line 6620
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 6625
   STACKTOP = sp; //@line 6626
   return $$0 | 0; //@line 6626
  }
 }
 L244 : do {
  if (!(HEAP32[1598] & 4)) {
   $561 = HEAP32[1493] | 0; //@line 6634
   L246 : do {
    if (!$561) {
     label = 163; //@line 6638
    } else {
     $$0$i$i = 6396; //@line 6640
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 6642
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 6645
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 6654
      if (!$570) {
       label = 163; //@line 6657
       break L246;
      } else {
       $$0$i$i = $570; //@line 6660
      }
     }
     $595 = $547 - $530 & $549; //@line 6664
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 6667
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 6675
       } else {
        $$723947$i = $595; //@line 6677
        $$748$i = $597; //@line 6677
        label = 180; //@line 6678
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 6682
       $$2253$ph$i = $595; //@line 6682
       label = 171; //@line 6683
      }
     } else {
      $$2234243136$i = 0; //@line 6686
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 6692
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 6695
     } else {
      $574 = $572; //@line 6697
      $575 = HEAP32[1606] | 0; //@line 6698
      $576 = $575 + -1 | 0; //@line 6699
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 6707
      $584 = HEAP32[1595] | 0; //@line 6708
      $585 = $$$i + $584 | 0; //@line 6709
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1597] | 0; //@line 6714
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 6721
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 6725
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 6728
        $$748$i = $572; //@line 6728
        label = 180; //@line 6729
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 6732
        $$2253$ph$i = $$$i; //@line 6732
        label = 171; //@line 6733
       }
      } else {
       $$2234243136$i = 0; //@line 6736
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 6743
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 6752
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 6755
       $$748$i = $$2247$ph$i; //@line 6755
       label = 180; //@line 6756
       break L244;
      }
     }
     $607 = HEAP32[1607] | 0; //@line 6760
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 6764
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 6767
      $$748$i = $$2247$ph$i; //@line 6767
      label = 180; //@line 6768
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 6774
      $$2234243136$i = 0; //@line 6775
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 6779
      $$748$i = $$2247$ph$i; //@line 6779
      label = 180; //@line 6780
      break L244;
     }
    }
   } while (0);
   HEAP32[1598] = HEAP32[1598] | 4; //@line 6787
   $$4236$i = $$2234243136$i; //@line 6788
   label = 178; //@line 6789
  } else {
   $$4236$i = 0; //@line 6791
   label = 178; //@line 6792
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 6798
   $621 = _sbrk(0) | 0; //@line 6799
   $627 = $621 - $620 | 0; //@line 6807
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 6809
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 6817
    $$748$i = $620; //@line 6817
    label = 180; //@line 6818
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1595] | 0) + $$723947$i | 0; //@line 6824
  HEAP32[1595] = $633; //@line 6825
  if ($633 >>> 0 > (HEAP32[1596] | 0) >>> 0) {
   HEAP32[1596] = $633; //@line 6829
  }
  $636 = HEAP32[1493] | 0; //@line 6831
  do {
   if (!$636) {
    $638 = HEAP32[1491] | 0; //@line 6835
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1491] = $$748$i; //@line 6840
    }
    HEAP32[1599] = $$748$i; //@line 6842
    HEAP32[1600] = $$723947$i; //@line 6843
    HEAP32[1602] = 0; //@line 6844
    HEAP32[1496] = HEAP32[1605]; //@line 6846
    HEAP32[1495] = -1; //@line 6847
    HEAP32[1500] = 5988; //@line 6848
    HEAP32[1499] = 5988; //@line 6849
    HEAP32[1502] = 5996; //@line 6850
    HEAP32[1501] = 5996; //@line 6851
    HEAP32[1504] = 6004; //@line 6852
    HEAP32[1503] = 6004; //@line 6853
    HEAP32[1506] = 6012; //@line 6854
    HEAP32[1505] = 6012; //@line 6855
    HEAP32[1508] = 6020; //@line 6856
    HEAP32[1507] = 6020; //@line 6857
    HEAP32[1510] = 6028; //@line 6858
    HEAP32[1509] = 6028; //@line 6859
    HEAP32[1512] = 6036; //@line 6860
    HEAP32[1511] = 6036; //@line 6861
    HEAP32[1514] = 6044; //@line 6862
    HEAP32[1513] = 6044; //@line 6863
    HEAP32[1516] = 6052; //@line 6864
    HEAP32[1515] = 6052; //@line 6865
    HEAP32[1518] = 6060; //@line 6866
    HEAP32[1517] = 6060; //@line 6867
    HEAP32[1520] = 6068; //@line 6868
    HEAP32[1519] = 6068; //@line 6869
    HEAP32[1522] = 6076; //@line 6870
    HEAP32[1521] = 6076; //@line 6871
    HEAP32[1524] = 6084; //@line 6872
    HEAP32[1523] = 6084; //@line 6873
    HEAP32[1526] = 6092; //@line 6874
    HEAP32[1525] = 6092; //@line 6875
    HEAP32[1528] = 6100; //@line 6876
    HEAP32[1527] = 6100; //@line 6877
    HEAP32[1530] = 6108; //@line 6878
    HEAP32[1529] = 6108; //@line 6879
    HEAP32[1532] = 6116; //@line 6880
    HEAP32[1531] = 6116; //@line 6881
    HEAP32[1534] = 6124; //@line 6882
    HEAP32[1533] = 6124; //@line 6883
    HEAP32[1536] = 6132; //@line 6884
    HEAP32[1535] = 6132; //@line 6885
    HEAP32[1538] = 6140; //@line 6886
    HEAP32[1537] = 6140; //@line 6887
    HEAP32[1540] = 6148; //@line 6888
    HEAP32[1539] = 6148; //@line 6889
    HEAP32[1542] = 6156; //@line 6890
    HEAP32[1541] = 6156; //@line 6891
    HEAP32[1544] = 6164; //@line 6892
    HEAP32[1543] = 6164; //@line 6893
    HEAP32[1546] = 6172; //@line 6894
    HEAP32[1545] = 6172; //@line 6895
    HEAP32[1548] = 6180; //@line 6896
    HEAP32[1547] = 6180; //@line 6897
    HEAP32[1550] = 6188; //@line 6898
    HEAP32[1549] = 6188; //@line 6899
    HEAP32[1552] = 6196; //@line 6900
    HEAP32[1551] = 6196; //@line 6901
    HEAP32[1554] = 6204; //@line 6902
    HEAP32[1553] = 6204; //@line 6903
    HEAP32[1556] = 6212; //@line 6904
    HEAP32[1555] = 6212; //@line 6905
    HEAP32[1558] = 6220; //@line 6906
    HEAP32[1557] = 6220; //@line 6907
    HEAP32[1560] = 6228; //@line 6908
    HEAP32[1559] = 6228; //@line 6909
    HEAP32[1562] = 6236; //@line 6910
    HEAP32[1561] = 6236; //@line 6911
    $642 = $$723947$i + -40 | 0; //@line 6912
    $644 = $$748$i + 8 | 0; //@line 6914
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 6919
    $650 = $$748$i + $649 | 0; //@line 6920
    $651 = $642 - $649 | 0; //@line 6921
    HEAP32[1493] = $650; //@line 6922
    HEAP32[1490] = $651; //@line 6923
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 6926
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 6929
    HEAP32[1494] = HEAP32[1609]; //@line 6931
   } else {
    $$024367$i = 6396; //@line 6933
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 6935
     $658 = $$024367$i + 4 | 0; //@line 6936
     $659 = HEAP32[$658 >> 2] | 0; //@line 6937
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 6941
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 6945
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 6950
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 6964
       $673 = (HEAP32[1490] | 0) + $$723947$i | 0; //@line 6966
       $675 = $636 + 8 | 0; //@line 6968
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 6973
       $681 = $636 + $680 | 0; //@line 6974
       $682 = $673 - $680 | 0; //@line 6975
       HEAP32[1493] = $681; //@line 6976
       HEAP32[1490] = $682; //@line 6977
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 6980
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 6983
       HEAP32[1494] = HEAP32[1609]; //@line 6985
       break;
      }
     }
    }
    $688 = HEAP32[1491] | 0; //@line 6990
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1491] = $$748$i; //@line 6993
     $753 = $$748$i; //@line 6994
    } else {
     $753 = $688; //@line 6996
    }
    $690 = $$748$i + $$723947$i | 0; //@line 6998
    $$124466$i = 6396; //@line 6999
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 7004
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 7008
     if (!$694) {
      $$0$i$i$i = 6396; //@line 7011
      break;
     } else {
      $$124466$i = $694; //@line 7014
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 7023
      $700 = $$124466$i + 4 | 0; //@line 7024
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 7027
      $704 = $$748$i + 8 | 0; //@line 7029
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 7035
      $712 = $690 + 8 | 0; //@line 7037
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 7043
      $722 = $710 + $$0197 | 0; //@line 7047
      $723 = $718 - $710 - $$0197 | 0; //@line 7048
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 7051
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1490] | 0) + $723 | 0; //@line 7056
        HEAP32[1490] = $728; //@line 7057
        HEAP32[1493] = $722; //@line 7058
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 7061
       } else {
        if ((HEAP32[1492] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1489] | 0) + $723 | 0; //@line 7067
         HEAP32[1489] = $734; //@line 7068
         HEAP32[1492] = $722; //@line 7069
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 7072
         HEAP32[$722 + $734 >> 2] = $734; //@line 7074
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 7078
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 7082
         $743 = $739 >>> 3; //@line 7083
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 7088
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 7090
           $750 = 5988 + ($743 << 1 << 2) | 0; //@line 7092
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 7098
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 7107
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1487] = HEAP32[1487] & ~(1 << $743); //@line 7117
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 7124
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 7128
             }
             $764 = $748 + 8 | 0; //@line 7131
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 7135
              break;
             }
             _abort(); //@line 7138
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 7143
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 7144
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 7147
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 7149
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 7153
             $783 = $782 + 4 | 0; //@line 7154
             $784 = HEAP32[$783 >> 2] | 0; //@line 7155
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 7158
              if (!$786) {
               $$3$i$i = 0; //@line 7161
               break;
              } else {
               $$1291$i$i = $786; //@line 7164
               $$1293$i$i = $782; //@line 7164
              }
             } else {
              $$1291$i$i = $784; //@line 7167
              $$1293$i$i = $783; //@line 7167
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 7170
              $789 = HEAP32[$788 >> 2] | 0; //@line 7171
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 7174
               $$1293$i$i = $788; //@line 7174
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 7177
              $792 = HEAP32[$791 >> 2] | 0; //@line 7178
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 7183
               $$1293$i$i = $791; //@line 7183
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 7188
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 7191
              $$3$i$i = $$1291$i$i; //@line 7192
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 7197
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 7200
             }
             $776 = $774 + 12 | 0; //@line 7203
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 7207
             }
             $779 = $771 + 8 | 0; //@line 7210
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 7214
              HEAP32[$779 >> 2] = $774; //@line 7215
              $$3$i$i = $771; //@line 7216
              break;
             } else {
              _abort(); //@line 7219
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 7229
           $798 = 6252 + ($797 << 2) | 0; //@line 7230
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 7235
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1488] = HEAP32[1488] & ~(1 << $797); //@line 7244
             break L311;
            } else {
             if ((HEAP32[1491] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 7250
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 7258
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1491] | 0; //@line 7268
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 7271
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 7275
           $815 = $718 + 16 | 0; //@line 7276
           $816 = HEAP32[$815 >> 2] | 0; //@line 7277
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 7283
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 7287
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 7289
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 7295
           if (!$822) {
            break;
           }
           if ((HEAP32[1491] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 7303
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 7307
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 7309
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 7316
         $$0287$i$i = $742 + $723 | 0; //@line 7316
        } else {
         $$0$i17$i = $718; //@line 7318
         $$0287$i$i = $723; //@line 7318
        }
        $830 = $$0$i17$i + 4 | 0; //@line 7320
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 7323
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 7326
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 7328
        $836 = $$0287$i$i >>> 3; //@line 7329
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5988 + ($836 << 1 << 2) | 0; //@line 7333
         $840 = HEAP32[1487] | 0; //@line 7334
         $841 = 1 << $836; //@line 7335
         do {
          if (!($840 & $841)) {
           HEAP32[1487] = $840 | $841; //@line 7341
           $$0295$i$i = $839; //@line 7343
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 7343
          } else {
           $845 = $839 + 8 | 0; //@line 7345
           $846 = HEAP32[$845 >> 2] | 0; //@line 7346
           if ((HEAP32[1491] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 7350
            $$pre$phi$i19$iZ2D = $845; //@line 7350
            break;
           }
           _abort(); //@line 7353
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 7357
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 7359
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 7361
         HEAP32[$722 + 12 >> 2] = $839; //@line 7363
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 7366
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 7370
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 7374
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 7379
          $858 = $852 << $857; //@line 7380
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 7383
          $863 = $858 << $861; //@line 7385
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 7388
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 7393
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 7399
         }
        } while (0);
        $877 = 6252 + ($$0296$i$i << 2) | 0; //@line 7402
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 7404
        $879 = $722 + 16 | 0; //@line 7405
        HEAP32[$879 + 4 >> 2] = 0; //@line 7407
        HEAP32[$879 >> 2] = 0; //@line 7408
        $881 = HEAP32[1488] | 0; //@line 7409
        $882 = 1 << $$0296$i$i; //@line 7410
        if (!($881 & $882)) {
         HEAP32[1488] = $881 | $882; //@line 7415
         HEAP32[$877 >> 2] = $722; //@line 7416
         HEAP32[$722 + 24 >> 2] = $877; //@line 7418
         HEAP32[$722 + 12 >> 2] = $722; //@line 7420
         HEAP32[$722 + 8 >> 2] = $722; //@line 7422
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 7431
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 7431
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 7438
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 7442
         $902 = HEAP32[$900 >> 2] | 0; //@line 7444
         if (!$902) {
          label = 260; //@line 7447
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 7450
          $$0289$i$i = $902; //@line 7450
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1491] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 7457
         } else {
          HEAP32[$900 >> 2] = $722; //@line 7460
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 7462
          HEAP32[$722 + 12 >> 2] = $722; //@line 7464
          HEAP32[$722 + 8 >> 2] = $722; //@line 7466
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 7471
         $910 = HEAP32[$909 >> 2] | 0; //@line 7472
         $911 = HEAP32[1491] | 0; //@line 7473
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 7479
          HEAP32[$909 >> 2] = $722; //@line 7480
          HEAP32[$722 + 8 >> 2] = $910; //@line 7482
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 7484
          HEAP32[$722 + 24 >> 2] = 0; //@line 7486
          break;
         } else {
          _abort(); //@line 7489
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 7496
      STACKTOP = sp; //@line 7497
      return $$0 | 0; //@line 7497
     } else {
      $$0$i$i$i = 6396; //@line 7499
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 7503
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 7508
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 7516
    }
    $927 = $923 + -47 | 0; //@line 7518
    $929 = $927 + 8 | 0; //@line 7520
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 7526
    $936 = $636 + 16 | 0; //@line 7527
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 7529
    $939 = $938 + 8 | 0; //@line 7530
    $940 = $938 + 24 | 0; //@line 7531
    $941 = $$723947$i + -40 | 0; //@line 7532
    $943 = $$748$i + 8 | 0; //@line 7534
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 7539
    $949 = $$748$i + $948 | 0; //@line 7540
    $950 = $941 - $948 | 0; //@line 7541
    HEAP32[1493] = $949; //@line 7542
    HEAP32[1490] = $950; //@line 7543
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 7546
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 7549
    HEAP32[1494] = HEAP32[1609]; //@line 7551
    $956 = $938 + 4 | 0; //@line 7552
    HEAP32[$956 >> 2] = 27; //@line 7553
    HEAP32[$939 >> 2] = HEAP32[1599]; //@line 7554
    HEAP32[$939 + 4 >> 2] = HEAP32[1600]; //@line 7554
    HEAP32[$939 + 8 >> 2] = HEAP32[1601]; //@line 7554
    HEAP32[$939 + 12 >> 2] = HEAP32[1602]; //@line 7554
    HEAP32[1599] = $$748$i; //@line 7555
    HEAP32[1600] = $$723947$i; //@line 7556
    HEAP32[1602] = 0; //@line 7557
    HEAP32[1601] = $939; //@line 7558
    $958 = $940; //@line 7559
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 7561
     HEAP32[$958 >> 2] = 7; //@line 7562
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 7575
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 7578
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 7581
     HEAP32[$938 >> 2] = $964; //@line 7582
     $969 = $964 >>> 3; //@line 7583
     if ($964 >>> 0 < 256) {
      $972 = 5988 + ($969 << 1 << 2) | 0; //@line 7587
      $973 = HEAP32[1487] | 0; //@line 7588
      $974 = 1 << $969; //@line 7589
      if (!($973 & $974)) {
       HEAP32[1487] = $973 | $974; //@line 7594
       $$0211$i$i = $972; //@line 7596
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 7596
      } else {
       $978 = $972 + 8 | 0; //@line 7598
       $979 = HEAP32[$978 >> 2] | 0; //@line 7599
       if ((HEAP32[1491] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 7603
       } else {
        $$0211$i$i = $979; //@line 7606
        $$pre$phi$i$iZ2D = $978; //@line 7606
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 7609
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 7611
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 7613
      HEAP32[$636 + 12 >> 2] = $972; //@line 7615
      break;
     }
     $985 = $964 >>> 8; //@line 7618
     if (!$985) {
      $$0212$i$i = 0; //@line 7621
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 7625
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 7629
       $991 = $985 << $990; //@line 7630
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 7633
       $996 = $991 << $994; //@line 7635
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 7638
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 7643
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 7649
      }
     }
     $1010 = 6252 + ($$0212$i$i << 2) | 0; //@line 7652
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 7654
     HEAP32[$636 + 20 >> 2] = 0; //@line 7656
     HEAP32[$936 >> 2] = 0; //@line 7657
     $1013 = HEAP32[1488] | 0; //@line 7658
     $1014 = 1 << $$0212$i$i; //@line 7659
     if (!($1013 & $1014)) {
      HEAP32[1488] = $1013 | $1014; //@line 7664
      HEAP32[$1010 >> 2] = $636; //@line 7665
      HEAP32[$636 + 24 >> 2] = $1010; //@line 7667
      HEAP32[$636 + 12 >> 2] = $636; //@line 7669
      HEAP32[$636 + 8 >> 2] = $636; //@line 7671
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 7680
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 7680
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 7687
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 7691
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 7693
      if (!$1034) {
       label = 286; //@line 7696
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 7699
       $$0207$i$i = $1034; //@line 7699
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1491] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 7706
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 7709
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 7711
       HEAP32[$636 + 12 >> 2] = $636; //@line 7713
       HEAP32[$636 + 8 >> 2] = $636; //@line 7715
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 7720
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 7721
      $1043 = HEAP32[1491] | 0; //@line 7722
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 7728
       HEAP32[$1041 >> 2] = $636; //@line 7729
       HEAP32[$636 + 8 >> 2] = $1042; //@line 7731
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 7733
       HEAP32[$636 + 24 >> 2] = 0; //@line 7735
       break;
      } else {
       _abort(); //@line 7738
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1490] | 0; //@line 7745
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 7748
   HEAP32[1490] = $1054; //@line 7749
   $1055 = HEAP32[1493] | 0; //@line 7750
   $1056 = $1055 + $$0197 | 0; //@line 7751
   HEAP32[1493] = $1056; //@line 7752
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 7755
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 7758
   $$0 = $1055 + 8 | 0; //@line 7760
   STACKTOP = sp; //@line 7761
   return $$0 | 0; //@line 7761
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 7765
 $$0 = 0; //@line 7766
 STACKTOP = sp; //@line 7767
 return $$0 | 0; //@line 7767
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$019$i = 0, $$019$i$1 = 0, $$019$i$2 = 0, $$019$i$3 = 0, $$019$i$4 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$2 = 0, $$3 = 0, $$355 = 0, $$byval_copy58 = 0, $$lcssa$i = 0, $$lcssa127 = 0, $$sink$i = 0, $11 = 0, $114 = 0, $120 = 0, $127 = 0, $128 = 0, $133 = 0, $135 = 0, $136 = 0, $139 = 0, $143 = 0, $144 = 0, $148 = 0, $151 = 0, $153 = 0, $154 = 0, $159 = 0, $167 = 0, $178 = 0, $183 = 0, $184 = 0, $186 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $261 = 0, $268 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $28 = 0, $283 = 0, $29 = 0, $290 = 0, $30 = 0, $31 = 0, $311 = 0, $334 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $349 = 0, $35 = 0, $356 = 0, $37 = 0, $377 = 0, $38 = 0, $39 = 0, $40 = 0, $400 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $415 = 0, $422 = 0, $443 = 0, $466 = 0, $468 = 0, $469 = 0, $470 = 0, $471 = 0, $481 = 0, $488 = 0, $5 = 0, $50 = 0, $505 = 0, $521 = 0, $57 = 0, $6 = 0, $78 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx18 = 0, $AsyncCtx21 = 0, $AsyncCtx24 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3154
 STACKTOP = STACKTOP + 144 | 0; //@line 3155
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 3155
 $$byval_copy58 = sp + 120 | 0; //@line 3156
 $5 = sp + 64 | 0; //@line 3157
 $6 = sp; //@line 3158
 if (!$1) {
  $$3 = -3003; //@line 3161
  STACKTOP = sp; //@line 3162
  return $$3 | 0; //@line 3162
 }
 $8 = _strlen($1) | 0; //@line 3164
 if (($8 | 0) > 128 | ($8 | 0) == 0) {
  $$3 = -3003; //@line 3169
  STACKTOP = sp; //@line 3170
  return $$3 | 0; //@line 3170
 }
 __ZN9UDPSocketC2Ev($5); //@line 3172
 $AsyncCtx41 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3173
 $11 = __ZN6Socket4openEP12NetworkStack($5, $0) | 0; //@line 3174
 if (___async) {
  HEAP32[$AsyncCtx41 >> 2] = 78; //@line 3177
  HEAP32[$AsyncCtx41 + 4 >> 2] = $1; //@line 3179
  HEAP32[$AsyncCtx41 + 8 >> 2] = $5; //@line 3181
  HEAP32[$AsyncCtx41 + 12 >> 2] = $6; //@line 3183
  HEAP32[$AsyncCtx41 + 16 >> 2] = $5; //@line 3185
  HEAP32[$AsyncCtx41 + 20 >> 2] = $3; //@line 3187
  HEAP32[$AsyncCtx41 + 24 >> 2] = $5; //@line 3189
  HEAP32[$AsyncCtx41 + 28 >> 2] = $2; //@line 3191
  HEAP32[$AsyncCtx41 + 32 >> 2] = $4; //@line 3193
  sp = STACKTOP; //@line 3194
  STACKTOP = sp; //@line 3195
  return 0; //@line 3195
 }
 _emscripten_free_async_context($AsyncCtx41 | 0); //@line 3197
 do {
  if (!$11) {
   __ZN6Socket11set_timeoutEi($5, 5e3); //@line 3201
   $21 = _malloc(512) | 0; //@line 3202
   if (!$21) {
    $$2 = -3007; //@line 3205
   } else {
    $23 = $21; //@line 3207
    $24 = $21 + 1 | 0; //@line 3208
    $25 = $21 + 2 | 0; //@line 3209
    $26 = $21 + 3 | 0; //@line 3210
    $27 = $21 + 4 | 0; //@line 3211
    $28 = $21 + 5 | 0; //@line 3212
    $29 = $21 + 6 | 0; //@line 3213
    $30 = $21 + 7 | 0; //@line 3214
    $31 = $21 + 12 | 0; //@line 3215
    $$sink$i = ($4 | 0) == 2 ? 28 : 1; //@line 3217
    HEAP8[$21 >> 0] = 0; //@line 3218
    HEAP8[$24 >> 0] = 1; //@line 3219
    HEAP8[$25 >> 0] = 1; //@line 3220
    HEAP8[$26 >> 0] = 0; //@line 3221
    HEAP8[$27 >> 0] = 0; //@line 3222
    HEAP8[$28 >> 0] = 1; //@line 3223
    HEAP8[$29 >> 0] = 0; //@line 3224
    HEAP8[$29 + 1 >> 0] = 0; //@line 3224
    HEAP8[$29 + 2 >> 0] = 0; //@line 3224
    HEAP8[$29 + 3 >> 0] = 0; //@line 3224
    HEAP8[$29 + 4 >> 0] = 0; //@line 3224
    HEAP8[$29 + 5 >> 0] = 0; //@line 3224
    if (!(HEAP8[$1 >> 0] | 0)) {
     $50 = $31; //@line 3228
    } else {
     $$019$i = $1; //@line 3230
     $38 = $31; //@line 3230
     while (1) {
      $35 = _strcspn($$019$i, 3461) | 0; //@line 3232
      $37 = $38 + 1 | 0; //@line 3234
      HEAP8[$38 >> 0] = $35; //@line 3235
      $39 = $35 & 255; //@line 3236
      _memcpy($37 | 0, $$019$i | 0, $39 | 0) | 0; //@line 3237
      $40 = $37 + $39 | 0; //@line 3238
      $$019$i = $$019$i + ($35 + ((HEAP8[$$019$i + $35 >> 0] | 0) == 46 & 1)) | 0; //@line 3244
      if (!(HEAP8[$$019$i >> 0] | 0)) {
       $50 = $40; //@line 3248
       break;
      } else {
       $38 = $40; //@line 3251
      }
     }
    }
    HEAP8[$50 >> 0] = 0; //@line 3256
    HEAP8[$50 + 1 >> 0] = 0; //@line 3258
    HEAP8[$50 + 2 >> 0] = $$sink$i; //@line 3260
    HEAP8[$50 + 3 >> 0] = 0; //@line 3262
    HEAP8[$50 + 4 >> 0] = 1; //@line 3263
    HEAP32[$$byval_copy58 >> 2] = HEAP32[114]; //@line 3264
    HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[115]; //@line 3264
    HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[116]; //@line 3264
    HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[117]; //@line 3264
    HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[118]; //@line 3264
    __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3265
    $AsyncCtx30 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3269
    $57 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $50 + 5 - $23 | 0) | 0; //@line 3270
    if (___async) {
     HEAP32[$AsyncCtx30 >> 2] = 79; //@line 3273
     HEAP32[$AsyncCtx30 + 4 >> 2] = $21; //@line 3275
     HEAP32[$AsyncCtx30 + 8 >> 2] = $24; //@line 3277
     HEAP32[$AsyncCtx30 + 12 >> 2] = $25; //@line 3279
     HEAP32[$AsyncCtx30 + 16 >> 2] = $26; //@line 3281
     HEAP32[$AsyncCtx30 + 20 >> 2] = $27; //@line 3283
     HEAP32[$AsyncCtx30 + 24 >> 2] = $28; //@line 3285
     HEAP32[$AsyncCtx30 + 28 >> 2] = $29; //@line 3287
     HEAP32[$AsyncCtx30 + 32 >> 2] = $1; //@line 3289
     HEAP32[$AsyncCtx30 + 36 >> 2] = $5; //@line 3291
     HEAP32[$AsyncCtx30 + 40 >> 2] = $31; //@line 3293
     HEAP8[$AsyncCtx30 + 44 >> 0] = $$sink$i; //@line 3295
     HEAP32[$AsyncCtx30 + 48 >> 2] = $6; //@line 3297
     HEAP32[$AsyncCtx30 + 52 >> 2] = $6; //@line 3299
     HEAP32[$AsyncCtx30 + 56 >> 2] = $23; //@line 3301
     HEAP32[$AsyncCtx30 + 60 >> 2] = $5; //@line 3303
     HEAP32[$AsyncCtx30 + 64 >> 2] = $3; //@line 3305
     HEAP32[$AsyncCtx30 + 68 >> 2] = $30; //@line 3307
     HEAP32[$AsyncCtx30 + 72 >> 2] = $5; //@line 3309
     HEAP32[$AsyncCtx30 + 76 >> 2] = $2; //@line 3311
     sp = STACKTOP; //@line 3312
     STACKTOP = sp; //@line 3313
     return 0; //@line 3313
    }
    _emscripten_free_async_context($AsyncCtx30 | 0); //@line 3315
    do {
     if (($57 | 0) < 0) {
      label = 35; //@line 3319
     } else {
      $AsyncCtx15 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3321
      $78 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3322
      if (___async) {
       HEAP32[$AsyncCtx15 >> 2] = 80; //@line 3325
       HEAP32[$AsyncCtx15 + 4 >> 2] = $21; //@line 3327
       HEAP32[$AsyncCtx15 + 8 >> 2] = $24; //@line 3329
       HEAP32[$AsyncCtx15 + 12 >> 2] = $25; //@line 3331
       HEAP32[$AsyncCtx15 + 16 >> 2] = $26; //@line 3333
       HEAP32[$AsyncCtx15 + 20 >> 2] = $27; //@line 3335
       HEAP32[$AsyncCtx15 + 24 >> 2] = $28; //@line 3337
       HEAP32[$AsyncCtx15 + 28 >> 2] = $29; //@line 3339
       HEAP32[$AsyncCtx15 + 32 >> 2] = $1; //@line 3341
       HEAP32[$AsyncCtx15 + 36 >> 2] = $5; //@line 3343
       HEAP32[$AsyncCtx15 + 40 >> 2] = $31; //@line 3345
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$sink$i; //@line 3347
       HEAP32[$AsyncCtx15 + 48 >> 2] = $6; //@line 3349
       HEAP32[$AsyncCtx15 + 52 >> 2] = $6; //@line 3351
       HEAP32[$AsyncCtx15 + 56 >> 2] = $23; //@line 3353
       HEAP32[$AsyncCtx15 + 60 >> 2] = $5; //@line 3355
       HEAP32[$AsyncCtx15 + 64 >> 2] = $3; //@line 3357
       HEAP32[$AsyncCtx15 + 68 >> 2] = $30; //@line 3359
       HEAP32[$AsyncCtx15 + 72 >> 2] = $5; //@line 3361
       HEAP32[$AsyncCtx15 + 76 >> 2] = $2; //@line 3363
       sp = STACKTOP; //@line 3364
       STACKTOP = sp; //@line 3365
       return 0; //@line 3365
      } else {
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3367
       if (($78 | 0) == -3001) {
        label = 35; //@line 3370
        break;
       } else {
        $$lcssa127 = $78; //@line 3373
        label = 15; //@line 3374
        break;
       }
      }
     }
    } while (0);
    L25 : do {
     if ((label | 0) == 35) {
      HEAP8[$21 >> 0] = 0; //@line 3382
      HEAP8[$24 >> 0] = 1; //@line 3383
      HEAP8[$25 >> 0] = 1; //@line 3384
      HEAP8[$26 >> 0] = 0; //@line 3385
      HEAP8[$27 >> 0] = 0; //@line 3386
      HEAP8[$28 >> 0] = 1; //@line 3387
      HEAP8[$29 >> 0] = 0; //@line 3388
      HEAP8[$29 + 1 >> 0] = 0; //@line 3388
      HEAP8[$29 + 2 >> 0] = 0; //@line 3388
      HEAP8[$29 + 3 >> 0] = 0; //@line 3388
      HEAP8[$29 + 4 >> 0] = 0; //@line 3388
      HEAP8[$29 + 5 >> 0] = 0; //@line 3388
      if (!(HEAP8[$1 >> 0] | 0)) {
       $283 = $31; //@line 3392
      } else {
       $$019$i$1 = $1; //@line 3394
       $271 = $31; //@line 3394
       while (1) {
        $268 = _strcspn($$019$i$1, 3461) | 0; //@line 3396
        $270 = $271 + 1 | 0; //@line 3398
        HEAP8[$271 >> 0] = $268; //@line 3399
        $272 = $268 & 255; //@line 3400
        _memcpy($270 | 0, $$019$i$1 | 0, $272 | 0) | 0; //@line 3401
        $273 = $270 + $272 | 0; //@line 3402
        $$019$i$1 = $$019$i$1 + ($268 + ((HEAP8[$$019$i$1 + $268 >> 0] | 0) == 46 & 1)) | 0; //@line 3408
        if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
         $283 = $273; //@line 3412
         break;
        } else {
         $271 = $273; //@line 3415
        }
       }
      }
      HEAP8[$283 >> 0] = 0; //@line 3420
      HEAP8[$283 + 1 >> 0] = 0; //@line 3422
      HEAP8[$283 + 2 >> 0] = $$sink$i; //@line 3424
      HEAP8[$283 + 3 >> 0] = 0; //@line 3426
      HEAP8[$283 + 4 >> 0] = 1; //@line 3427
      HEAP32[$$byval_copy58 >> 2] = HEAP32[119]; //@line 3428
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[120]; //@line 3428
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[121]; //@line 3428
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[122]; //@line 3428
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[123]; //@line 3428
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3429
      $AsyncCtx27 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3433
      $290 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $283 + 5 - $23 | 0) | 0; //@line 3434
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 83; //@line 3437
       HEAP32[$AsyncCtx27 + 4 >> 2] = $5; //@line 3439
       HEAP32[$AsyncCtx27 + 8 >> 2] = $21; //@line 3441
       HEAP32[$AsyncCtx27 + 12 >> 2] = $31; //@line 3443
       HEAP8[$AsyncCtx27 + 16 >> 0] = $$sink$i; //@line 3445
       HEAP32[$AsyncCtx27 + 20 >> 2] = $6; //@line 3447
       HEAP32[$AsyncCtx27 + 24 >> 2] = $6; //@line 3449
       HEAP32[$AsyncCtx27 + 28 >> 2] = $23; //@line 3451
       HEAP32[$AsyncCtx27 + 32 >> 2] = $5; //@line 3453
       HEAP32[$AsyncCtx27 + 36 >> 2] = $24; //@line 3455
       HEAP32[$AsyncCtx27 + 40 >> 2] = $25; //@line 3457
       HEAP32[$AsyncCtx27 + 44 >> 2] = $26; //@line 3459
       HEAP32[$AsyncCtx27 + 48 >> 2] = $27; //@line 3461
       HEAP32[$AsyncCtx27 + 52 >> 2] = $28; //@line 3463
       HEAP32[$AsyncCtx27 + 56 >> 2] = $29; //@line 3465
       HEAP32[$AsyncCtx27 + 60 >> 2] = $1; //@line 3467
       HEAP32[$AsyncCtx27 + 64 >> 2] = $3; //@line 3469
       HEAP32[$AsyncCtx27 + 68 >> 2] = $30; //@line 3471
       HEAP32[$AsyncCtx27 + 72 >> 2] = $5; //@line 3473
       HEAP32[$AsyncCtx27 + 76 >> 2] = $2; //@line 3475
       sp = STACKTOP; //@line 3476
       STACKTOP = sp; //@line 3477
       return 0; //@line 3477
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 3479
      do {
       if (($290 | 0) >= 0) {
        $AsyncCtx11 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3483
        $311 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3484
        if (___async) {
         HEAP32[$AsyncCtx11 >> 2] = 84; //@line 3487
         HEAP32[$AsyncCtx11 + 4 >> 2] = $5; //@line 3489
         HEAP32[$AsyncCtx11 + 8 >> 2] = $21; //@line 3491
         HEAP32[$AsyncCtx11 + 12 >> 2] = $31; //@line 3493
         HEAP8[$AsyncCtx11 + 16 >> 0] = $$sink$i; //@line 3495
         HEAP32[$AsyncCtx11 + 20 >> 2] = $6; //@line 3497
         HEAP32[$AsyncCtx11 + 24 >> 2] = $6; //@line 3499
         HEAP32[$AsyncCtx11 + 28 >> 2] = $23; //@line 3501
         HEAP32[$AsyncCtx11 + 32 >> 2] = $5; //@line 3503
         HEAP32[$AsyncCtx11 + 36 >> 2] = $24; //@line 3505
         HEAP32[$AsyncCtx11 + 40 >> 2] = $25; //@line 3507
         HEAP32[$AsyncCtx11 + 44 >> 2] = $26; //@line 3509
         HEAP32[$AsyncCtx11 + 48 >> 2] = $27; //@line 3511
         HEAP32[$AsyncCtx11 + 52 >> 2] = $28; //@line 3513
         HEAP32[$AsyncCtx11 + 56 >> 2] = $29; //@line 3515
         HEAP32[$AsyncCtx11 + 60 >> 2] = $1; //@line 3517
         HEAP32[$AsyncCtx11 + 64 >> 2] = $3; //@line 3519
         HEAP32[$AsyncCtx11 + 68 >> 2] = $30; //@line 3521
         HEAP32[$AsyncCtx11 + 72 >> 2] = $5; //@line 3523
         HEAP32[$AsyncCtx11 + 76 >> 2] = $2; //@line 3525
         sp = STACKTOP; //@line 3526
         STACKTOP = sp; //@line 3527
         return 0; //@line 3527
        } else {
         _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3529
         if (($311 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $311; //@line 3534
          label = 15; //@line 3535
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 3541
      HEAP8[$24 >> 0] = 1; //@line 3542
      HEAP8[$25 >> 0] = 1; //@line 3543
      HEAP8[$26 >> 0] = 0; //@line 3544
      HEAP8[$27 >> 0] = 0; //@line 3545
      HEAP8[$28 >> 0] = 1; //@line 3546
      HEAP8[$29 >> 0] = 0; //@line 3547
      HEAP8[$29 + 1 >> 0] = 0; //@line 3547
      HEAP8[$29 + 2 >> 0] = 0; //@line 3547
      HEAP8[$29 + 3 >> 0] = 0; //@line 3547
      HEAP8[$29 + 4 >> 0] = 0; //@line 3547
      HEAP8[$29 + 5 >> 0] = 0; //@line 3547
      if (!(HEAP8[$1 >> 0] | 0)) {
       $349 = $31; //@line 3551
      } else {
       $$019$i$2 = $1; //@line 3553
       $337 = $31; //@line 3553
       while (1) {
        $334 = _strcspn($$019$i$2, 3461) | 0; //@line 3555
        $336 = $337 + 1 | 0; //@line 3557
        HEAP8[$337 >> 0] = $334; //@line 3558
        $338 = $334 & 255; //@line 3559
        _memcpy($336 | 0, $$019$i$2 | 0, $338 | 0) | 0; //@line 3560
        $339 = $336 + $338 | 0; //@line 3561
        $$019$i$2 = $$019$i$2 + ($334 + ((HEAP8[$$019$i$2 + $334 >> 0] | 0) == 46 & 1)) | 0; //@line 3567
        if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
         $349 = $339; //@line 3571
         break;
        } else {
         $337 = $339; //@line 3574
        }
       }
      }
      HEAP8[$349 >> 0] = 0; //@line 3579
      HEAP8[$349 + 1 >> 0] = 0; //@line 3581
      HEAP8[$349 + 2 >> 0] = $$sink$i; //@line 3583
      HEAP8[$349 + 3 >> 0] = 0; //@line 3585
      HEAP8[$349 + 4 >> 0] = 1; //@line 3586
      HEAP32[$$byval_copy58 >> 2] = HEAP32[124]; //@line 3587
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[125]; //@line 3587
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[126]; //@line 3587
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[127]; //@line 3587
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[128]; //@line 3587
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3588
      $AsyncCtx24 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3592
      $356 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $349 + 5 - $23 | 0) | 0; //@line 3593
      if (___async) {
       HEAP32[$AsyncCtx24 >> 2] = 85; //@line 3596
       HEAP32[$AsyncCtx24 + 4 >> 2] = $5; //@line 3598
       HEAP32[$AsyncCtx24 + 8 >> 2] = $21; //@line 3600
       HEAP32[$AsyncCtx24 + 12 >> 2] = $31; //@line 3602
       HEAP8[$AsyncCtx24 + 16 >> 0] = $$sink$i; //@line 3604
       HEAP32[$AsyncCtx24 + 20 >> 2] = $6; //@line 3606
       HEAP32[$AsyncCtx24 + 24 >> 2] = $6; //@line 3608
       HEAP32[$AsyncCtx24 + 28 >> 2] = $23; //@line 3610
       HEAP32[$AsyncCtx24 + 32 >> 2] = $5; //@line 3612
       HEAP32[$AsyncCtx24 + 36 >> 2] = $3; //@line 3614
       HEAP32[$AsyncCtx24 + 40 >> 2] = $24; //@line 3616
       HEAP32[$AsyncCtx24 + 44 >> 2] = $25; //@line 3618
       HEAP32[$AsyncCtx24 + 48 >> 2] = $26; //@line 3620
       HEAP32[$AsyncCtx24 + 52 >> 2] = $27; //@line 3622
       HEAP32[$AsyncCtx24 + 56 >> 2] = $28; //@line 3624
       HEAP32[$AsyncCtx24 + 60 >> 2] = $29; //@line 3626
       HEAP32[$AsyncCtx24 + 64 >> 2] = $30; //@line 3628
       HEAP32[$AsyncCtx24 + 68 >> 2] = $5; //@line 3630
       HEAP32[$AsyncCtx24 + 72 >> 2] = $2; //@line 3632
       HEAP32[$AsyncCtx24 + 76 >> 2] = $1; //@line 3634
       sp = STACKTOP; //@line 3635
       STACKTOP = sp; //@line 3636
       return 0; //@line 3636
      }
      _emscripten_free_async_context($AsyncCtx24 | 0); //@line 3638
      do {
       if (($356 | 0) >= 0) {
        $AsyncCtx7 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3642
        $377 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3643
        if (___async) {
         HEAP32[$AsyncCtx7 >> 2] = 86; //@line 3646
         HEAP32[$AsyncCtx7 + 4 >> 2] = $5; //@line 3648
         HEAP32[$AsyncCtx7 + 8 >> 2] = $21; //@line 3650
         HEAP32[$AsyncCtx7 + 12 >> 2] = $31; //@line 3652
         HEAP8[$AsyncCtx7 + 16 >> 0] = $$sink$i; //@line 3654
         HEAP32[$AsyncCtx7 + 20 >> 2] = $6; //@line 3656
         HEAP32[$AsyncCtx7 + 24 >> 2] = $6; //@line 3658
         HEAP32[$AsyncCtx7 + 28 >> 2] = $23; //@line 3660
         HEAP32[$AsyncCtx7 + 32 >> 2] = $5; //@line 3662
         HEAP32[$AsyncCtx7 + 36 >> 2] = $24; //@line 3664
         HEAP32[$AsyncCtx7 + 40 >> 2] = $25; //@line 3666
         HEAP32[$AsyncCtx7 + 44 >> 2] = $26; //@line 3668
         HEAP32[$AsyncCtx7 + 48 >> 2] = $27; //@line 3670
         HEAP32[$AsyncCtx7 + 52 >> 2] = $28; //@line 3672
         HEAP32[$AsyncCtx7 + 56 >> 2] = $29; //@line 3674
         HEAP32[$AsyncCtx7 + 60 >> 2] = $1; //@line 3676
         HEAP32[$AsyncCtx7 + 64 >> 2] = $3; //@line 3678
         HEAP32[$AsyncCtx7 + 68 >> 2] = $30; //@line 3680
         HEAP32[$AsyncCtx7 + 72 >> 2] = $5; //@line 3682
         HEAP32[$AsyncCtx7 + 76 >> 2] = $2; //@line 3684
         sp = STACKTOP; //@line 3685
         STACKTOP = sp; //@line 3686
         return 0; //@line 3686
        } else {
         _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3688
         if (($377 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $377; //@line 3693
          label = 15; //@line 3694
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 3700
      HEAP8[$24 >> 0] = 1; //@line 3701
      HEAP8[$25 >> 0] = 1; //@line 3702
      HEAP8[$26 >> 0] = 0; //@line 3703
      HEAP8[$27 >> 0] = 0; //@line 3704
      HEAP8[$28 >> 0] = 1; //@line 3705
      HEAP8[$29 >> 0] = 0; //@line 3706
      HEAP8[$29 + 1 >> 0] = 0; //@line 3706
      HEAP8[$29 + 2 >> 0] = 0; //@line 3706
      HEAP8[$29 + 3 >> 0] = 0; //@line 3706
      HEAP8[$29 + 4 >> 0] = 0; //@line 3706
      HEAP8[$29 + 5 >> 0] = 0; //@line 3706
      if (!(HEAP8[$1 >> 0] | 0)) {
       $415 = $31; //@line 3710
      } else {
       $$019$i$3 = $1; //@line 3712
       $403 = $31; //@line 3712
       while (1) {
        $400 = _strcspn($$019$i$3, 3461) | 0; //@line 3714
        $402 = $403 + 1 | 0; //@line 3716
        HEAP8[$403 >> 0] = $400; //@line 3717
        $404 = $400 & 255; //@line 3718
        _memcpy($402 | 0, $$019$i$3 | 0, $404 | 0) | 0; //@line 3719
        $405 = $402 + $404 | 0; //@line 3720
        $$019$i$3 = $$019$i$3 + ($400 + ((HEAP8[$$019$i$3 + $400 >> 0] | 0) == 46 & 1)) | 0; //@line 3726
        if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
         $415 = $405; //@line 3730
         break;
        } else {
         $403 = $405; //@line 3733
        }
       }
      }
      HEAP8[$415 >> 0] = 0; //@line 3738
      HEAP8[$415 + 1 >> 0] = 0; //@line 3740
      HEAP8[$415 + 2 >> 0] = $$sink$i; //@line 3742
      HEAP8[$415 + 3 >> 0] = 0; //@line 3744
      HEAP8[$415 + 4 >> 0] = 1; //@line 3745
      HEAP32[$$byval_copy58 >> 2] = HEAP32[129]; //@line 3746
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[130]; //@line 3746
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[131]; //@line 3746
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[132]; //@line 3746
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[133]; //@line 3746
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3747
      $AsyncCtx21 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3751
      $422 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $415 + 5 - $23 | 0) | 0; //@line 3752
      if (___async) {
       HEAP32[$AsyncCtx21 >> 2] = 87; //@line 3755
       HEAP32[$AsyncCtx21 + 4 >> 2] = $5; //@line 3757
       HEAP32[$AsyncCtx21 + 8 >> 2] = $21; //@line 3759
       HEAP32[$AsyncCtx21 + 12 >> 2] = $31; //@line 3761
       HEAP8[$AsyncCtx21 + 16 >> 0] = $$sink$i; //@line 3763
       HEAP32[$AsyncCtx21 + 20 >> 2] = $6; //@line 3765
       HEAP32[$AsyncCtx21 + 24 >> 2] = $6; //@line 3767
       HEAP32[$AsyncCtx21 + 28 >> 2] = $23; //@line 3769
       HEAP32[$AsyncCtx21 + 32 >> 2] = $5; //@line 3771
       HEAP32[$AsyncCtx21 + 36 >> 2] = $3; //@line 3773
       HEAP32[$AsyncCtx21 + 40 >> 2] = $24; //@line 3775
       HEAP32[$AsyncCtx21 + 44 >> 2] = $25; //@line 3777
       HEAP32[$AsyncCtx21 + 48 >> 2] = $26; //@line 3779
       HEAP32[$AsyncCtx21 + 52 >> 2] = $27; //@line 3781
       HEAP32[$AsyncCtx21 + 56 >> 2] = $28; //@line 3783
       HEAP32[$AsyncCtx21 + 60 >> 2] = $29; //@line 3785
       HEAP32[$AsyncCtx21 + 64 >> 2] = $30; //@line 3787
       HEAP32[$AsyncCtx21 + 68 >> 2] = $5; //@line 3789
       HEAP32[$AsyncCtx21 + 72 >> 2] = $2; //@line 3791
       HEAP32[$AsyncCtx21 + 76 >> 2] = $1; //@line 3793
       sp = STACKTOP; //@line 3794
       STACKTOP = sp; //@line 3795
       return 0; //@line 3795
      }
      _emscripten_free_async_context($AsyncCtx21 | 0); //@line 3797
      do {
       if (($422 | 0) >= 0) {
        $AsyncCtx3 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3801
        $443 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3802
        if (___async) {
         HEAP32[$AsyncCtx3 >> 2] = 88; //@line 3805
         HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3807
         HEAP32[$AsyncCtx3 + 8 >> 2] = $21; //@line 3809
         HEAP32[$AsyncCtx3 + 12 >> 2] = $31; //@line 3811
         HEAP8[$AsyncCtx3 + 16 >> 0] = $$sink$i; //@line 3813
         HEAP32[$AsyncCtx3 + 20 >> 2] = $6; //@line 3815
         HEAP32[$AsyncCtx3 + 24 >> 2] = $6; //@line 3817
         HEAP32[$AsyncCtx3 + 28 >> 2] = $23; //@line 3819
         HEAP32[$AsyncCtx3 + 32 >> 2] = $5; //@line 3821
         HEAP32[$AsyncCtx3 + 36 >> 2] = $24; //@line 3823
         HEAP32[$AsyncCtx3 + 40 >> 2] = $25; //@line 3825
         HEAP32[$AsyncCtx3 + 44 >> 2] = $26; //@line 3827
         HEAP32[$AsyncCtx3 + 48 >> 2] = $27; //@line 3829
         HEAP32[$AsyncCtx3 + 52 >> 2] = $28; //@line 3831
         HEAP32[$AsyncCtx3 + 56 >> 2] = $29; //@line 3833
         HEAP32[$AsyncCtx3 + 60 >> 2] = $1; //@line 3835
         HEAP32[$AsyncCtx3 + 64 >> 2] = $3; //@line 3837
         HEAP32[$AsyncCtx3 + 68 >> 2] = $30; //@line 3839
         HEAP32[$AsyncCtx3 + 72 >> 2] = $5; //@line 3841
         HEAP32[$AsyncCtx3 + 76 >> 2] = $2; //@line 3843
         sp = STACKTOP; //@line 3844
         STACKTOP = sp; //@line 3845
         return 0; //@line 3845
        } else {
         _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3847
         if (($443 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $443; //@line 3852
          label = 15; //@line 3853
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 3859
      HEAP8[$24 >> 0] = 1; //@line 3860
      HEAP8[$25 >> 0] = 1; //@line 3861
      HEAP8[$26 >> 0] = 0; //@line 3862
      HEAP8[$27 >> 0] = 0; //@line 3863
      HEAP8[$28 >> 0] = 1; //@line 3864
      HEAP8[$29 >> 0] = 0; //@line 3865
      HEAP8[$29 + 1 >> 0] = 0; //@line 3865
      HEAP8[$29 + 2 >> 0] = 0; //@line 3865
      HEAP8[$29 + 3 >> 0] = 0; //@line 3865
      HEAP8[$29 + 4 >> 0] = 0; //@line 3865
      HEAP8[$29 + 5 >> 0] = 0; //@line 3865
      if (!(HEAP8[$1 >> 0] | 0)) {
       $481 = $31; //@line 3869
      } else {
       $$019$i$4 = $1; //@line 3871
       $469 = $31; //@line 3871
       while (1) {
        $466 = _strcspn($$019$i$4, 3461) | 0; //@line 3873
        $468 = $469 + 1 | 0; //@line 3875
        HEAP8[$469 >> 0] = $466; //@line 3876
        $470 = $466 & 255; //@line 3877
        _memcpy($468 | 0, $$019$i$4 | 0, $470 | 0) | 0; //@line 3878
        $471 = $468 + $470 | 0; //@line 3879
        $$019$i$4 = $$019$i$4 + ($466 + ((HEAP8[$$019$i$4 + $466 >> 0] | 0) == 46 & 1)) | 0; //@line 3885
        if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
         $481 = $471; //@line 3889
         break;
        } else {
         $469 = $471; //@line 3892
        }
       }
      }
      HEAP8[$481 >> 0] = 0; //@line 3897
      HEAP8[$481 + 1 >> 0] = 0; //@line 3899
      HEAP8[$481 + 2 >> 0] = $$sink$i; //@line 3901
      HEAP8[$481 + 3 >> 0] = 0; //@line 3903
      HEAP8[$481 + 4 >> 0] = 1; //@line 3904
      HEAP32[$$byval_copy58 >> 2] = HEAP32[134]; //@line 3905
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[135]; //@line 3905
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[136]; //@line 3905
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[137]; //@line 3905
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[138]; //@line 3905
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3906
      $AsyncCtx18 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3910
      $488 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $481 + 5 - $23 | 0) | 0; //@line 3911
      if (___async) {
       HEAP32[$AsyncCtx18 >> 2] = 89; //@line 3914
       HEAP32[$AsyncCtx18 + 4 >> 2] = $5; //@line 3916
       HEAP32[$AsyncCtx18 + 8 >> 2] = $21; //@line 3918
       HEAP32[$AsyncCtx18 + 12 >> 2] = $5; //@line 3920
       HEAP32[$AsyncCtx18 + 16 >> 2] = $3; //@line 3922
       HEAP32[$AsyncCtx18 + 20 >> 2] = $31; //@line 3924
       HEAP32[$AsyncCtx18 + 24 >> 2] = $6; //@line 3926
       HEAP32[$AsyncCtx18 + 28 >> 2] = $24; //@line 3928
       HEAP32[$AsyncCtx18 + 32 >> 2] = $25; //@line 3930
       HEAP32[$AsyncCtx18 + 36 >> 2] = $26; //@line 3932
       HEAP32[$AsyncCtx18 + 40 >> 2] = $27; //@line 3934
       HEAP32[$AsyncCtx18 + 44 >> 2] = $28; //@line 3936
       HEAP32[$AsyncCtx18 + 48 >> 2] = $29; //@line 3938
       HEAP32[$AsyncCtx18 + 52 >> 2] = $30; //@line 3940
       HEAP32[$AsyncCtx18 + 56 >> 2] = $5; //@line 3942
       HEAP32[$AsyncCtx18 + 60 >> 2] = $2; //@line 3944
       sp = STACKTOP; //@line 3945
       STACKTOP = sp; //@line 3946
       return 0; //@line 3946
      }
      _emscripten_free_async_context($AsyncCtx18 | 0); //@line 3948
      if (($488 | 0) < 0) {
       $$355 = -3009; //@line 3951
       break;
      }
      $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 3954
      $505 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3955
      if (___async) {
       HEAP32[$AsyncCtx >> 2] = 90; //@line 3958
       HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 3960
       HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 3962
       HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 3964
       HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3966
       HEAP32[$AsyncCtx + 20 >> 2] = $31; //@line 3968
       HEAP32[$AsyncCtx + 24 >> 2] = $24; //@line 3970
       HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 3972
       HEAP32[$AsyncCtx + 32 >> 2] = $26; //@line 3974
       HEAP32[$AsyncCtx + 36 >> 2] = $27; //@line 3976
       HEAP32[$AsyncCtx + 40 >> 2] = $28; //@line 3978
       HEAP32[$AsyncCtx + 44 >> 2] = $29; //@line 3980
       HEAP32[$AsyncCtx + 48 >> 2] = $30; //@line 3982
       HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 3984
       HEAP32[$AsyncCtx + 56 >> 2] = $2; //@line 3986
       sp = STACKTOP; //@line 3987
       STACKTOP = sp; //@line 3988
       return 0; //@line 3988
      } else {
       _emscripten_free_async_context($AsyncCtx | 0); //@line 3990
       if (($505 | 0) == -3001) {
        $$355 = -3009; //@line 3993
        break;
       } else {
        $$lcssa127 = $505; //@line 3996
        label = 15; //@line 3997
        break;
       }
      }
     }
    } while (0);
    if ((label | 0) == 15) {
     if (($$lcssa127 | 0) < 0) {
      $$355 = $$lcssa127; //@line 4006
     } else {
      $114 = HEAPU8[$27 >> 0] << 8 | HEAPU8[$28 >> 0]; //@line 4022
      $120 = HEAPU8[$29 >> 0] << 8 | HEAPU8[$30 >> 0]; //@line 4028
      if (((HEAP8[$25 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$21 >> 0] << 8 | HEAPU8[$24 >> 0] | 0) == 1 : 0) & (HEAP8[$26 >> 0] & 15) == 0) {
       if (!$114) {
        $521 = $31; //@line 4038
       } else {
        $$093119$i = 0; //@line 4040
        $128 = $31; //@line 4040
        while (1) {
         $127 = HEAP8[$128 >> 0] | 0; //@line 4042
         if (!($127 << 24 >> 24)) {
          $$lcssa$i = $128; //@line 4045
         } else {
          $133 = $128; //@line 4047
          $135 = $127; //@line 4047
          while (1) {
           $136 = $133 + 1 + ($135 & 255) | 0; //@line 4051
           $135 = HEAP8[$136 >> 0] | 0; //@line 4052
           if (!($135 << 24 >> 24)) {
            $$lcssa$i = $136; //@line 4055
            break;
           } else {
            $133 = $136; //@line 4058
           }
          }
         }
         $139 = $$lcssa$i + 5 | 0; //@line 4062
         $$093119$i = $$093119$i + 1 | 0; //@line 4063
         if (($$093119$i | 0) >= ($114 | 0)) {
          $521 = $139; //@line 4068
          break;
         } else {
          $128 = $139; //@line 4066
         }
        }
       }
       if (($3 | 0) != 0 & ($120 | 0) != 0) {
        $$090117$i = $2; //@line 4077
        $$094116$i = 0; //@line 4077
        $$095115$i = 0; //@line 4077
        $143 = $521; //@line 4077
        while (1) {
         $144 = HEAP8[$143 >> 0] | 0; //@line 4080
         do {
          if (!($144 << 24 >> 24)) {
           $159 = $143 + 1 | 0; //@line 4084
          } else {
           $148 = $144 & 255; //@line 4087
           $151 = $143; //@line 4087
           while (1) {
            if ($148 & 192 | 0) {
             label = 25; //@line 4092
             break;
            }
            $153 = $151 + 1 + $148 | 0; //@line 4096
            $154 = HEAP8[$153 >> 0] | 0; //@line 4097
            if (!($154 << 24 >> 24)) {
             label = 27; //@line 4101
             break;
            } else {
             $148 = $154 & 255; //@line 4104
             $151 = $153; //@line 4104
            }
           }
           if ((label | 0) == 25) {
            label = 0; //@line 4108
            $159 = $151 + 2 | 0; //@line 4110
            break;
           } else if ((label | 0) == 27) {
            label = 0; //@line 4114
            $159 = $153 + 1 | 0; //@line 4116
            break;
           }
          }
         } while (0);
         $167 = (HEAPU8[$159 >> 0] << 8 | HEAPU8[$159 + 1 >> 0]) & 65535; //@line 4129
         $178 = $159 + 10 | 0; //@line 4140
         $183 = HEAPU8[$159 + 8 >> 0] << 8 | HEAPU8[$159 + 9 >> 0]; //@line 4145
         $184 = $183 & 65535; //@line 4146
         $186 = (HEAPU8[$159 + 2 >> 0] << 8 | HEAPU8[$159 + 3 >> 0] | 0) == 1; //@line 4148
         do {
          if ($167 << 16 >> 16 == 1 & $186 & $184 << 16 >> 16 == 4) {
           HEAP32[$$090117$i >> 2] = 1; //@line 4154
           HEAP8[$$090117$i + 4 >> 0] = HEAP8[$178 >> 0] | 0; //@line 4158
           HEAP8[$$090117$i + 5 >> 0] = HEAP8[$159 + 11 >> 0] | 0; //@line 4162
           HEAP8[$$090117$i + 6 >> 0] = HEAP8[$159 + 12 >> 0] | 0; //@line 4166
           HEAP8[$$090117$i + 7 >> 0] = HEAP8[$159 + 13 >> 0] | 0; //@line 4170
           $$0 = $159 + 14 | 0; //@line 4173
           $$1$i = $$090117$i + 20 | 0; //@line 4173
           $$196$i = $$095115$i + 1 | 0; //@line 4173
          } else {
           if ($167 << 16 >> 16 == 28 & $186 & $184 << 16 >> 16 == 16) {
            HEAP32[$$090117$i >> 2] = 2; //@line 4180
            HEAP8[$$090117$i + 4 >> 0] = HEAP8[$178 >> 0] | 0; //@line 4184
            HEAP8[$$090117$i + 5 >> 0] = HEAP8[$159 + 11 >> 0] | 0; //@line 4188
            HEAP8[$$090117$i + 6 >> 0] = HEAP8[$159 + 12 >> 0] | 0; //@line 4192
            HEAP8[$$090117$i + 7 >> 0] = HEAP8[$159 + 13 >> 0] | 0; //@line 4196
            HEAP8[$$090117$i + 8 >> 0] = HEAP8[$159 + 14 >> 0] | 0; //@line 4200
            HEAP8[$$090117$i + 9 >> 0] = HEAP8[$159 + 15 >> 0] | 0; //@line 4204
            HEAP8[$$090117$i + 10 >> 0] = HEAP8[$159 + 16 >> 0] | 0; //@line 4208
            HEAP8[$$090117$i + 11 >> 0] = HEAP8[$159 + 17 >> 0] | 0; //@line 4212
            HEAP8[$$090117$i + 12 >> 0] = HEAP8[$159 + 18 >> 0] | 0; //@line 4216
            HEAP8[$$090117$i + 13 >> 0] = HEAP8[$159 + 19 >> 0] | 0; //@line 4220
            HEAP8[$$090117$i + 14 >> 0] = HEAP8[$159 + 20 >> 0] | 0; //@line 4224
            HEAP8[$$090117$i + 15 >> 0] = HEAP8[$159 + 21 >> 0] | 0; //@line 4228
            HEAP8[$$090117$i + 16 >> 0] = HEAP8[$159 + 22 >> 0] | 0; //@line 4232
            HEAP8[$$090117$i + 17 >> 0] = HEAP8[$159 + 23 >> 0] | 0; //@line 4236
            HEAP8[$$090117$i + 18 >> 0] = HEAP8[$159 + 24 >> 0] | 0; //@line 4240
            HEAP8[$$090117$i + 19 >> 0] = HEAP8[$159 + 25 >> 0] | 0; //@line 4244
            $$0 = $159 + 26 | 0; //@line 4247
            $$1$i = $$090117$i + 20 | 0; //@line 4247
            $$196$i = $$095115$i + 1 | 0; //@line 4247
            break;
           } else {
            $$0 = $178 + $183 | 0; //@line 4251
            $$1$i = $$090117$i; //@line 4251
            $$196$i = $$095115$i; //@line 4251
            break;
           }
          }
         } while (0);
         $$094116$i = $$094116$i + 1 | 0; //@line 4256
         if (!(($$094116$i | 0) < ($120 | 0) & $$196$i >>> 0 < $3 >>> 0)) {
          $$089$i = $$196$i; //@line 4263
          break;
         } else {
          $$090117$i = $$1$i; //@line 4261
          $$095115$i = $$196$i; //@line 4261
          $143 = $$0; //@line 4261
         }
        }
       } else {
        $$089$i = 0; //@line 4268
       }
      } else {
       $$089$i = 0; //@line 4271
      }
      $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 4275
     }
    }
    _free($21); //@line 4278
    $AsyncCtx37 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4279
    $261 = __ZN6Socket5closeEv($5) | 0; //@line 4280
    if (___async) {
     HEAP32[$AsyncCtx37 >> 2] = 81; //@line 4283
     HEAP32[$AsyncCtx37 + 4 >> 2] = $$355; //@line 4285
     HEAP32[$AsyncCtx37 + 8 >> 2] = $5; //@line 4287
     HEAP32[$AsyncCtx37 + 12 >> 2] = $5; //@line 4289
     sp = STACKTOP; //@line 4290
     STACKTOP = sp; //@line 4291
     return 0; //@line 4291
    } else {
     _emscripten_free_async_context($AsyncCtx37 | 0); //@line 4293
     $$2 = ($261 | 0) == 0 ? $$355 : $261; //@line 4296
     break;
    }
   }
  } else {
   $$2 = $11; //@line 4301
  }
 } while (0);
 $AsyncCtx34 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4304
 __ZN9UDPSocketD2Ev($5); //@line 4305
 if (___async) {
  HEAP32[$AsyncCtx34 >> 2] = 82; //@line 4308
  HEAP32[$AsyncCtx34 + 4 >> 2] = $5; //@line 4310
  HEAP32[$AsyncCtx34 + 8 >> 2] = $$2; //@line 4312
  sp = STACKTOP; //@line 4313
  STACKTOP = sp; //@line 4314
  return 0; //@line 4314
 }
 _emscripten_free_async_context($AsyncCtx34 | 0); //@line 4316
 $$3 = $$2; //@line 4317
 STACKTOP = sp; //@line 4318
 return $$3 | 0; //@line 4318
}
function _vfscanf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$$0268 = 0, $$0266$lcssa = 0, $$0266397 = 0, $$0268 = 0, $$0270 = 0, $$0272 = 0, $$0273408 = 0, $$0276$ph = 0, $$0278$ph = 0, $$0278$ph$phi = 0, $$0278$ph336 = 0, $$0283407 = 0, $$0286399 = 0, $$0288404 = 0, $$0292 = 0, $$0293 = 0, $$0305402 = 0, $$10 = 0, $$11 = 0, $$1267 = 0, $$1271 = 0, $$1274 = 0, $$1277$ph = 0, $$1279 = 0, $$1284 = 0, $$1289 = 0, $$1306 = 0, $$2 = 0, $$2275 = 0, $$2280 = 0, $$2280$ph = 0, $$2280$ph$phi = 0, $$2285 = 0, $$2290 = 0, $$2307$ph = 0, $$3$lcssa = 0, $$3281 = 0, $$3291 = 0, $$3396 = 0, $$4 = 0, $$4282 = 0, $$4309 = 0, $$5 = 0, $$5299 = 0, $$5310 = 0, $$6 = 0, $$6$pn = 0, $$6311 = 0, $$7 = 0, $$7$ph = 0, $$7312 = 0, $$8 = 0, $$8313 = 0, $$9 = 0, $$9314 = 0, $$ph = 0, $$sink330 = 0, $$sroa$2$0$$sroa_idx13 = 0, $100 = 0, $101 = 0, $106 = 0, $108 = 0, $11 = 0, $111 = 0, $112 = 0, $114 = 0, $117 = 0, $120 = 0, $122 = 0, $127 = 0, $13 = 0, $134 = 0, $14 = 0, $140 = 0, $146 = 0, $148 = 0, $149 = 0, $15 = 0, $155 = 0, $158 = 0, $16 = 0, $162 = 0, $164 = 0, $166 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $172 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $186 = 0, $187 = 0, $188 = 0, $190 = 0, $192 = 0, $193 = 0, $20 = 0, $201 = 0, $211 = 0, $213 = 0, $217 = 0, $219 = 0, $227 = 0, $23 = 0, $235 = 0, $236 = 0, $239 = 0, $247 = 0, $254 = 0, $262 = 0, $269 = 0, $274 = 0, $275 = 0, $28 = 0, $282 = 0, $292 = 0.0, $3 = 0, $312 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $320 = 0, $321 = 0, $322 = 0, $35 = 0, $4 = 0, $41 = 0, $47 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $54 = 0, $55 = 0, $6 = 0, $65 = 0, $90 = 0, $91 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11055
 STACKTOP = STACKTOP + 288 | 0; //@line 11056
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(288); //@line 11056
 $3 = sp + 8 | 0; //@line 11057
 $4 = sp + 17 | 0; //@line 11058
 $5 = sp; //@line 11059
 $6 = sp + 16 | 0; //@line 11060
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $314 = ___lockfile($0) | 0; //@line 11066
 } else {
  $314 = 0; //@line 11068
 }
 $11 = HEAP8[$1 >> 0] | 0; //@line 11070
 L4 : do {
  if (!($11 << 24 >> 24)) {
   $$3291 = 0; //@line 11074
  } else {
   $13 = $0 + 4 | 0; //@line 11076
   $14 = $0 + 100 | 0; //@line 11077
   $15 = $0 + 108 | 0; //@line 11078
   $16 = $0 + 8 | 0; //@line 11079
   $17 = $4 + 10 | 0; //@line 11080
   $18 = $4 + 33 | 0; //@line 11081
   $$sroa$2$0$$sroa_idx13 = $3 + 4 | 0; //@line 11082
   $$0273408 = $1; //@line 11083
   $$0283407 = 0; //@line 11083
   $$0288404 = 0; //@line 11083
   $$0305402 = 0; //@line 11083
   $20 = $11; //@line 11083
   $315 = 0; //@line 11083
   L6 : while (1) {
    L8 : do {
     if (!(_isspace($20 & 255) | 0)) {
      $50 = (HEAP8[$$0273408 >> 0] | 0) == 37; //@line 11091
      L10 : do {
       if ($50) {
        $51 = $$0273408 + 1 | 0; //@line 11094
        $52 = HEAP8[$51 >> 0] | 0; //@line 11095
        L12 : do {
         switch ($52 << 24 >> 24) {
         case 37:
          {
           break L10;
           break;
          }
         case 42:
          {
           $$0293 = 0; //@line 11104
           $$2275 = $$0273408 + 2 | 0; //@line 11104
           break;
          }
         default:
          {
           if (_isdigit($52 & 255) | 0) {
            if ((HEAP8[$$0273408 + 2 >> 0] | 0) == 36) {
             $$0293 = _arg_n_727($2, (HEAPU8[$51 >> 0] | 0) + -48 | 0) | 0; //@line 11121
             $$2275 = $$0273408 + 3 | 0; //@line 11121
             break L12;
            }
           }
           $90 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11136
           $91 = HEAP32[$90 >> 2] | 0; //@line 11137
           HEAP32[$2 >> 2] = $90 + 4; //@line 11139
           $$0293 = $91; //@line 11140
           $$2275 = $51; //@line 11140
          }
         }
        } while (0);
        if (!(_isdigit(HEAPU8[$$2275 >> 0] | 0) | 0)) {
         $$0266$lcssa = 0; //@line 11149
         $$3$lcssa = $$2275; //@line 11149
        } else {
         $$0266397 = 0; //@line 11151
         $$3396 = $$2275; //@line 11151
         while (1) {
          $100 = ($$0266397 * 10 | 0) + -48 + (HEAPU8[$$3396 >> 0] | 0) | 0; //@line 11157
          $101 = $$3396 + 1 | 0; //@line 11158
          if (!(_isdigit(HEAPU8[$101 >> 0] | 0) | 0)) {
           $$0266$lcssa = $100; //@line 11164
           $$3$lcssa = $101; //@line 11164
           break;
          } else {
           $$0266397 = $100; //@line 11167
           $$3396 = $101; //@line 11167
          }
         }
        }
        $106 = HEAP8[$$3$lcssa >> 0] | 0; //@line 11171
        $108 = $$3$lcssa + 1 | 0; //@line 11173
        if ($106 << 24 >> 24 == 109) {
         $$0270 = ($$0293 | 0) != 0 & 1; //@line 11178
         $$1306 = 0; //@line 11178
         $$4 = $108; //@line 11178
         $112 = HEAP8[$108 >> 0] | 0; //@line 11178
         $318 = 0; //@line 11178
        } else {
         $$0270 = 0; //@line 11180
         $$1306 = $$0305402; //@line 11180
         $$4 = $$3$lcssa; //@line 11180
         $112 = $106; //@line 11180
         $318 = $315; //@line 11180
        }
        $111 = $$4 + 1 | 0; //@line 11182
        switch ($112 << 24 >> 24) {
        case 104:
         {
          $114 = (HEAP8[$111 >> 0] | 0) == 104; //@line 11186
          $$0268 = $114 ? -2 : -1; //@line 11190
          $$5 = $114 ? $$4 + 2 | 0 : $111; //@line 11190
          break;
         }
        case 108:
         {
          $117 = (HEAP8[$111 >> 0] | 0) == 108; //@line 11195
          $$0268 = $117 ? 3 : 1; //@line 11199
          $$5 = $117 ? $$4 + 2 | 0 : $111; //@line 11199
          break;
         }
        case 106:
         {
          $$0268 = 3; //@line 11203
          $$5 = $111; //@line 11203
          break;
         }
        case 116:
        case 122:
         {
          $$0268 = 1; //@line 11207
          $$5 = $111; //@line 11207
          break;
         }
        case 76:
         {
          $$0268 = 2; //@line 11211
          $$5 = $111; //@line 11211
          break;
         }
        case 110:
        case 112:
        case 67:
        case 83:
        case 91:
        case 99:
        case 115:
        case 88:
        case 71:
        case 70:
        case 69:
        case 65:
        case 103:
        case 102:
        case 101:
        case 97:
        case 120:
        case 117:
        case 111:
        case 105:
        case 100:
         {
          $$0268 = 0; //@line 11215
          $$5 = $$4; //@line 11215
          break;
         }
        default:
         {
          $$7312 = $$1306; //@line 11219
          $319 = $318; //@line 11219
          label = 136; //@line 11220
          break L6;
         }
        }
        $120 = HEAPU8[$$5 >> 0] | 0; //@line 11225
        $122 = ($120 & 47 | 0) == 3; //@line 11227
        $$ = $122 ? $120 | 32 : $120; //@line 11229
        $$$0268 = $122 ? 1 : $$0268; //@line 11230
        $trunc = $$ & 255; //@line 11231
        switch ($trunc << 24 >> 24) {
        case 99:
         {
          $$1267 = ($$0266$lcssa | 0) > 1 ? $$0266$lcssa : 1; //@line 11236
          $$1284 = $$0283407; //@line 11236
          break;
         }
        case 91:
         {
          $$1267 = $$0266$lcssa; //@line 11240
          $$1284 = $$0283407; //@line 11240
          break;
         }
        case 110:
         {
          _store_int_728($$0293, $$$0268, $$0283407, (($$0283407 | 0) < 0) << 31 >> 31); //@line 11246
          $$11 = $$5; //@line 11247
          $$1289 = $$0288404; //@line 11247
          $$2285 = $$0283407; //@line 11247
          $$6311 = $$1306; //@line 11247
          $316 = $318; //@line 11247
          break L8;
          break;
         }
        default:
         {
          ___shlim($0, 0); //@line 11252
          do {
           $127 = HEAP32[$13 >> 2] | 0; //@line 11254
           if ($127 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
            HEAP32[$13 >> 2] = $127 + 1; //@line 11259
            $134 = HEAPU8[$127 >> 0] | 0; //@line 11262
           } else {
            $134 = ___shgetc($0) | 0; //@line 11265
           }
          } while ((_isspace($134) | 0) != 0);
          if (!(HEAP32[$14 >> 2] | 0)) {
           $146 = HEAP32[$13 >> 2] | 0; //@line 11277
          } else {
           $140 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11280
           HEAP32[$13 >> 2] = $140; //@line 11281
           $146 = $140; //@line 11283
          }
          $$1267 = $$0266$lcssa; //@line 11290
          $$1284 = (HEAP32[$15 >> 2] | 0) + $$0283407 + $146 - (HEAP32[$16 >> 2] | 0) | 0; //@line 11290
         }
        }
        ___shlim($0, $$1267); //@line 11293
        $148 = HEAP32[$13 >> 2] | 0; //@line 11294
        $149 = HEAP32[$14 >> 2] | 0; //@line 11295
        if ($148 >>> 0 < $149 >>> 0) {
         HEAP32[$13 >> 2] = $148 + 1; //@line 11299
         $155 = $149; //@line 11300
        } else {
         if ((___shgetc($0) | 0) < 0) {
          $$7312 = $$1306; //@line 11305
          $319 = $318; //@line 11305
          label = 136; //@line 11306
          break L6;
         }
         $155 = HEAP32[$14 >> 2] | 0; //@line 11310
        }
        if ($155 | 0) {
         HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + -1; //@line 11316
        }
        L58 : do {
         switch ($trunc << 24 >> 24) {
         case 91:
         case 99:
         case 115:
          {
           $158 = ($$ | 0) == 99; //@line 11321
           L60 : do {
            if (($$ | 16 | 0) == 115) {
             _memset($4 | 0, -1, 257) | 0; //@line 11327
             HEAP8[$4 >> 0] = 0; //@line 11328
             if (($$ | 0) == 115) {
              HEAP8[$18 >> 0] = 0; //@line 11330
              HEAP8[$17 >> 0] = 0; //@line 11331
              HEAP8[$17 + 1 >> 0] = 0; //@line 11331
              HEAP8[$17 + 2 >> 0] = 0; //@line 11331
              HEAP8[$17 + 3 >> 0] = 0; //@line 11331
              HEAP8[$17 + 4 >> 0] = 0; //@line 11331
              $$9 = $$5; //@line 11332
             } else {
              $$9 = $$5; //@line 11334
             }
            } else {
             $162 = $$5 + 1 | 0; //@line 11337
             $164 = (HEAP8[$162 >> 0] | 0) == 94; //@line 11339
             $$0292 = $164 & 1; //@line 11341
             $$6 = $164 ? $$5 + 2 | 0 : $162; //@line 11342
             _memset($4 | 0, $$0292 | 0, 257) | 0; //@line 11343
             HEAP8[$4 >> 0] = 0; //@line 11344
             $166 = HEAP8[$$6 >> 0] | 0; //@line 11345
             switch ($166 << 24 >> 24) {
             case 45:
              {
               $$6$pn = $$6; //@line 11348
               $$sink330 = 46; //@line 11348
               label = 65; //@line 11349
               break;
              }
             case 93:
              {
               $$6$pn = $$6; //@line 11353
               $$sink330 = 94; //@line 11353
               label = 65; //@line 11354
               break;
              }
             default:
              {
               $$7 = $$6; //@line 11358
               $168 = $166; //@line 11358
              }
             }
             while (1) {
              if ((label | 0) == 65) {
               label = 0; //@line 11363
               HEAP8[$4 + $$sink330 >> 0] = $$0292 ^ 1; //@line 11367
               $$7$ph = $$6$pn + 1 | 0; //@line 11368
               $$7 = $$7$ph; //@line 11370
               $168 = HEAP8[$$7$ph >> 0] | 0; //@line 11370
              }
              L70 : do {
               switch ($168 << 24 >> 24) {
               case 0:
                {
                 $$7312 = $$1306; //@line 11375
                 $319 = $318; //@line 11375
                 label = 136; //@line 11376
                 break L6;
                 break;
                }
               case 93:
                {
                 $$9 = $$7; //@line 11381
                 break L60;
                 break;
                }
               case 45:
                {
                 $169 = $$7 + 1 | 0; //@line 11386
                 $170 = HEAP8[$169 >> 0] | 0; //@line 11387
                 switch ($170 << 24 >> 24) {
                 case 93:
                 case 0:
                  {
                   $$8 = $$7; //@line 11390
                   $183 = 45; //@line 11390
                   break L70;
                   break;
                  }
                 default:
                  {}
                 }
                 $172 = HEAP8[$$7 + -1 >> 0] | 0; //@line 11398
                 if (($172 & 255) < ($170 & 255)) {
                  $176 = ($$0292 ^ 1) & 255; //@line 11403
                  $$0286399 = $172 & 255; //@line 11404
                  do {
                   $$0286399 = $$0286399 + 1 | 0; //@line 11406
                   HEAP8[$4 + $$0286399 >> 0] = $176; //@line 11408
                   $179 = HEAP8[$169 >> 0] | 0; //@line 11409
                  } while (($$0286399 | 0) < ($179 & 255 | 0));
                  $$8 = $169; //@line 11415
                  $183 = $179; //@line 11415
                 } else {
                  $$8 = $169; //@line 11420
                  $183 = $170; //@line 11420
                 }
                 break;
                }
               default:
                {
                 $$8 = $$7; //@line 11425
                 $183 = $168; //@line 11425
                }
               }
              } while (0);
              $$6$pn = $$8; //@line 11431
              $$sink330 = ($183 & 255) + 1 | 0; //@line 11431
              label = 65; //@line 11432
             }
            }
           } while (0);
           $186 = $158 ? $$1267 + 1 | 0 : 31; //@line 11437
           $187 = ($$$0268 | 0) == 1; //@line 11438
           $188 = ($$0270 | 0) != 0; //@line 11439
           L78 : do {
            if ($187) {
             if ($188) {
              $190 = _malloc($186 << 2) | 0; //@line 11444
              if (!$190) {
               $$7312 = 0; //@line 11447
               $319 = 0; //@line 11447
               label = 136; //@line 11448
               break L6;
              } else {
               $321 = $190; //@line 11451
              }
             } else {
              $321 = $$0293; //@line 11454
             }
             HEAP32[$3 >> 2] = 0; //@line 11456
             HEAP32[$$sroa$2$0$$sroa_idx13 >> 2] = 0; //@line 11457
             $$0276$ph = $186; //@line 11458
             $$0278$ph = 0; //@line 11458
             $$ph = $321; //@line 11458
             L83 : while (1) {
              $192 = ($$ph | 0) == 0; //@line 11460
              $$0278$ph336 = $$0278$ph; //@line 11461
              while (1) {
               L87 : while (1) {
                $193 = HEAP32[$13 >> 2] | 0; //@line 11464
                if ($193 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                 HEAP32[$13 >> 2] = $193 + 1; //@line 11469
                 $201 = HEAPU8[$193 >> 0] | 0; //@line 11472
                } else {
                 $201 = ___shgetc($0) | 0; //@line 11475
                }
                if (!(HEAP8[$4 + ($201 + 1) >> 0] | 0)) {
                 break L83;
                }
                HEAP8[$6 >> 0] = $201; //@line 11485
                switch (_mbrtowc($5, $6, 1, $3) | 0) {
                case -1:
                 {
                  $$7312 = 0; //@line 11489
                  $319 = $$ph; //@line 11489
                  label = 136; //@line 11490
                  break L6;
                  break;
                 }
                case -2:
                 {
                  break;
                 }
                default:
                 {
                  break L87;
                 }
                }
               }
               if ($192) {
                $$1279 = $$0278$ph336; //@line 11503
               } else {
                HEAP32[$$ph + ($$0278$ph336 << 2) >> 2] = HEAP32[$5 >> 2]; //@line 11508
                $$1279 = $$0278$ph336 + 1 | 0; //@line 11509
               }
               if ($188 & ($$1279 | 0) == ($$0276$ph | 0)) {
                break;
               } else {
                $$0278$ph336 = $$1279; //@line 11516
               }
              }
              $211 = $$0276$ph << 1 | 1; //@line 11520
              $213 = _realloc($$ph, $211 << 2) | 0; //@line 11522
              if (!$213) {
               $$7312 = 0; //@line 11525
               $319 = $$ph; //@line 11525
               label = 136; //@line 11526
               break L6;
              } else {
               $$0278$ph$phi = $$0276$ph; //@line 11529
               $$0276$ph = $211; //@line 11529
               $$ph = $213; //@line 11529
               $$0278$ph = $$0278$ph$phi; //@line 11529
              }
             }
             if (!(_mbsinit($3) | 0)) {
              $$7312 = 0; //@line 11535
              $319 = $$ph; //@line 11535
              label = 136; //@line 11536
              break L6;
             } else {
              $$4282 = $$0278$ph336; //@line 11539
              $$4309 = 0; //@line 11539
              $$5299 = $$ph; //@line 11539
              $322 = $$ph; //@line 11539
             }
            } else {
             if ($188) {
              $217 = _malloc($186) | 0; //@line 11543
              if (!$217) {
               $$7312 = 0; //@line 11546
               $319 = 0; //@line 11546
               label = 136; //@line 11547
               break L6;
              } else {
               $$1277$ph = $186; //@line 11550
               $$2280$ph = 0; //@line 11550
               $$2307$ph = $217; //@line 11550
              }
              while (1) {
               $$2280 = $$2280$ph; //@line 11553
               do {
                $219 = HEAP32[$13 >> 2] | 0; //@line 11555
                if ($219 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                 HEAP32[$13 >> 2] = $219 + 1; //@line 11560
                 $227 = HEAPU8[$219 >> 0] | 0; //@line 11563
                } else {
                 $227 = ___shgetc($0) | 0; //@line 11566
                }
                if (!(HEAP8[$4 + ($227 + 1) >> 0] | 0)) {
                 $$4282 = $$2280; //@line 11573
                 $$4309 = $$2307$ph; //@line 11573
                 $$5299 = 0; //@line 11573
                 $322 = 0; //@line 11573
                 break L78;
                }
                HEAP8[$$2307$ph + $$2280 >> 0] = $227; //@line 11579
                $$2280 = $$2280 + 1 | 0; //@line 11577
               } while (($$2280 | 0) != ($$1277$ph | 0));
               $235 = $$1277$ph << 1 | 1; //@line 11588
               $236 = _realloc($$2307$ph, $235) | 0; //@line 11589
               if (!$236) {
                $$7312 = $$2307$ph; //@line 11592
                $319 = 0; //@line 11592
                label = 136; //@line 11593
                break L6;
               } else {
                $$2280$ph$phi = $$1277$ph; //@line 11596
                $$1277$ph = $235; //@line 11596
                $$2307$ph = $236; //@line 11596
                $$2280$ph = $$2280$ph$phi; //@line 11596
               }
              }
             }
             if (!$$0293) {
              while (1) {
               $254 = HEAP32[$13 >> 2] | 0; //@line 11603
               if ($254 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                HEAP32[$13 >> 2] = $254 + 1; //@line 11608
                $262 = HEAPU8[$254 >> 0] | 0; //@line 11611
               } else {
                $262 = ___shgetc($0) | 0; //@line 11614
               }
               if (!(HEAP8[$4 + ($262 + 1) >> 0] | 0)) {
                $$4282 = 0; //@line 11621
                $$4309 = 0; //@line 11621
                $$5299 = 0; //@line 11621
                $322 = 0; //@line 11621
                break L78;
               }
              }
             } else {
              $$3281 = 0; //@line 11626
             }
             while (1) {
              $239 = HEAP32[$13 >> 2] | 0; //@line 11629
              if ($239 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
               HEAP32[$13 >> 2] = $239 + 1; //@line 11634
               $247 = HEAPU8[$239 >> 0] | 0; //@line 11637
              } else {
               $247 = ___shgetc($0) | 0; //@line 11640
              }
              if (!(HEAP8[$4 + ($247 + 1) >> 0] | 0)) {
               $$4282 = $$3281; //@line 11647
               $$4309 = $$0293; //@line 11647
               $$5299 = 0; //@line 11647
               $322 = 0; //@line 11647
               break L78;
              }
              HEAP8[$$0293 + $$3281 >> 0] = $247; //@line 11653
              $$3281 = $$3281 + 1 | 0; //@line 11654
             }
            }
           } while (0);
           if (!(HEAP32[$14 >> 2] | 0)) {
            $274 = HEAP32[$13 >> 2] | 0; //@line 11662
           } else {
            $269 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11665
            HEAP32[$13 >> 2] = $269; //@line 11666
            $274 = $269; //@line 11668
           }
           $275 = $274 - (HEAP32[$16 >> 2] | 0) + (HEAP32[$15 >> 2] | 0) | 0; //@line 11673
           if (!$275) {
            $$2 = $$0270; //@line 11676
            $$2290 = $$0288404; //@line 11676
            $$9314 = $$4309; //@line 11676
            $312 = $322; //@line 11676
            break L6;
           }
           if (!(($275 | 0) == ($$1267 | 0) | $158 ^ 1)) {
            $$2 = $$0270; //@line 11683
            $$2290 = $$0288404; //@line 11683
            $$9314 = $$4309; //@line 11683
            $312 = $322; //@line 11683
            break L6;
           }
           do {
            if ($188) {
             if ($187) {
              HEAP32[$$0293 >> 2] = $$5299; //@line 11689
              break;
             } else {
              HEAP32[$$0293 >> 2] = $$4309; //@line 11692
              break;
             }
            }
           } while (0);
           if ($158) {
            $$10 = $$9; //@line 11698
            $$5310 = $$4309; //@line 11698
            $320 = $322; //@line 11698
           } else {
            if ($$5299 | 0) {
             HEAP32[$$5299 + ($$4282 << 2) >> 2] = 0; //@line 11703
            }
            if (!$$4309) {
             $$10 = $$9; //@line 11707
             $$5310 = 0; //@line 11707
             $320 = $322; //@line 11707
             break L58;
            }
            HEAP8[$$4309 + $$4282 >> 0] = 0; //@line 11711
            $$10 = $$9; //@line 11712
            $$5310 = $$4309; //@line 11712
            $320 = $322; //@line 11712
           }
           break;
          }
         case 120:
         case 88:
         case 112:
          {
           $$0272 = 16; //@line 11717
           label = 124; //@line 11718
           break;
          }
         case 111:
          {
           $$0272 = 8; //@line 11722
           label = 124; //@line 11723
           break;
          }
         case 117:
         case 100:
          {
           $$0272 = 10; //@line 11727
           label = 124; //@line 11728
           break;
          }
         case 105:
          {
           $$0272 = 0; //@line 11732
           label = 124; //@line 11733
           break;
          }
         case 71:
         case 103:
         case 70:
         case 102:
         case 69:
         case 101:
         case 65:
         case 97:
          {
           $292 = +___floatscan($0, $$$0268, 0); //@line 11737
           if ((HEAP32[$15 >> 2] | 0) == ((HEAP32[$16 >> 2] | 0) - (HEAP32[$13 >> 2] | 0) | 0)) {
            $$2 = $$0270; //@line 11744
            $$2290 = $$0288404; //@line 11744
            $$9314 = $$1306; //@line 11744
            $312 = $318; //@line 11744
            break L6;
           }
           if (!$$0293) {
            $$10 = $$5; //@line 11749
            $$5310 = $$1306; //@line 11749
            $320 = $318; //@line 11749
           } else {
            switch ($$$0268 | 0) {
            case 0:
             {
              HEAPF32[$$0293 >> 2] = $292; //@line 11754
              $$10 = $$5; //@line 11755
              $$5310 = $$1306; //@line 11755
              $320 = $318; //@line 11755
              break L58;
              break;
             }
            case 1:
             {
              HEAPF64[$$0293 >> 3] = $292; //@line 11760
              $$10 = $$5; //@line 11761
              $$5310 = $$1306; //@line 11761
              $320 = $318; //@line 11761
              break L58;
              break;
             }
            case 2:
             {
              HEAPF64[$$0293 >> 3] = $292; //@line 11766
              $$10 = $$5; //@line 11767
              $$5310 = $$1306; //@line 11767
              $320 = $318; //@line 11767
              break L58;
              break;
             }
            default:
             {
              $$10 = $$5; //@line 11772
              $$5310 = $$1306; //@line 11772
              $320 = $318; //@line 11772
              break L58;
             }
            }
           }
           break;
          }
         default:
          {
           $$10 = $$5; //@line 11780
           $$5310 = $$1306; //@line 11780
           $320 = $318; //@line 11780
          }
         }
        } while (0);
        do {
         if ((label | 0) == 124) {
          label = 0; //@line 11786
          $282 = ___intscan($0, $$0272, 0, -1, -1) | 0; //@line 11787
          if ((HEAP32[$15 >> 2] | 0) == ((HEAP32[$16 >> 2] | 0) - (HEAP32[$13 >> 2] | 0) | 0)) {
           $$2 = $$0270; //@line 11795
           $$2290 = $$0288404; //@line 11795
           $$9314 = $$1306; //@line 11795
           $312 = $318; //@line 11795
           break L6;
          }
          if (($$0293 | 0) != 0 & ($$ | 0) == 112) {
           HEAP32[$$0293 >> 2] = $282; //@line 11803
           $$10 = $$5; //@line 11804
           $$5310 = $$1306; //@line 11804
           $320 = $318; //@line 11804
           break;
          } else {
           _store_int_728($$0293, $$$0268, $282, tempRet0); //@line 11807
           $$10 = $$5; //@line 11808
           $$5310 = $$1306; //@line 11808
           $320 = $318; //@line 11808
           break;
          }
         }
        } while (0);
        $$11 = $$10; //@line 11822
        $$1289 = $$0288404 + (($$0293 | 0) != 0 & 1) | 0; //@line 11822
        $$2285 = (HEAP32[$15 >> 2] | 0) + $$1284 + (HEAP32[$13 >> 2] | 0) - (HEAP32[$16 >> 2] | 0) | 0; //@line 11822
        $$6311 = $$5310; //@line 11822
        $316 = $320; //@line 11822
        break L8;
       }
      } while (0);
      $54 = $$0273408 + ($50 & 1) | 0; //@line 11827
      ___shlim($0, 0); //@line 11828
      $55 = HEAP32[$13 >> 2] | 0; //@line 11829
      if ($55 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
       HEAP32[$13 >> 2] = $55 + 1; //@line 11834
       $65 = HEAPU8[$55 >> 0] | 0; //@line 11837
      } else {
       $65 = ___shgetc($0) | 0; //@line 11840
      }
      if (($65 | 0) != (HEAPU8[$54 >> 0] | 0)) {
       label = 22; //@line 11846
       break L6;
      }
      $$11 = $54; //@line 11850
      $$1289 = $$0288404; //@line 11850
      $$2285 = $$0283407 + 1 | 0; //@line 11850
      $$6311 = $$0305402; //@line 11850
      $316 = $315; //@line 11850
     } else {
      $$1274 = $$0273408; //@line 11852
      while (1) {
       $23 = $$1274 + 1 | 0; //@line 11854
       if (!(_isspace(HEAPU8[$23 >> 0] | 0) | 0)) {
        break;
       } else {
        $$1274 = $23; //@line 11862
       }
      }
      ___shlim($0, 0); //@line 11865
      do {
       $28 = HEAP32[$13 >> 2] | 0; //@line 11867
       if ($28 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
        HEAP32[$13 >> 2] = $28 + 1; //@line 11872
        $35 = HEAPU8[$28 >> 0] | 0; //@line 11875
       } else {
        $35 = ___shgetc($0) | 0; //@line 11878
       }
      } while ((_isspace($35) | 0) != 0);
      if (!(HEAP32[$14 >> 2] | 0)) {
       $47 = HEAP32[$13 >> 2] | 0; //@line 11890
      } else {
       $41 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11893
       HEAP32[$13 >> 2] = $41; //@line 11894
       $47 = $41; //@line 11896
      }
      $$11 = $$1274; //@line 11903
      $$1289 = $$0288404; //@line 11903
      $$2285 = (HEAP32[$15 >> 2] | 0) + $$0283407 + $47 - (HEAP32[$16 >> 2] | 0) | 0; //@line 11903
      $$6311 = $$0305402; //@line 11903
      $316 = $315; //@line 11903
     }
    } while (0);
    $$0273408 = $$11 + 1 | 0; //@line 11906
    $20 = HEAP8[$$0273408 >> 0] | 0; //@line 11907
    if (!($20 << 24 >> 24)) {
     $$3291 = $$1289; //@line 11910
     break L4;
    } else {
     $$0283407 = $$2285; //@line 11913
     $$0288404 = $$1289; //@line 11913
     $$0305402 = $$6311; //@line 11913
     $315 = $316; //@line 11913
    }
   }
   if ((label | 0) == 22) {
    if (HEAP32[$14 >> 2] | 0) {
     HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + -1; //@line 11922
    }
    if (($$0288404 | 0) != 0 | ($65 | 0) > -1) {
     $$3291 = $$0288404; //@line 11928
     break;
    } else {
     $$1271 = 0; //@line 11931
     $$8313 = $$0305402; //@line 11931
     $317 = $315; //@line 11931
     label = 137; //@line 11932
    }
   } else if ((label | 0) == 136) {
    if (!$$0288404) {
     $$1271 = $$0270; //@line 11938
     $$8313 = $$7312; //@line 11938
     $317 = $319; //@line 11938
     label = 137; //@line 11939
    } else {
     $$2 = $$0270; //@line 11941
     $$2290 = $$0288404; //@line 11941
     $$9314 = $$7312; //@line 11941
     $312 = $319; //@line 11941
    }
   }
   if ((label | 0) == 137) {
    $$2 = $$1271; //@line 11945
    $$2290 = -1; //@line 11945
    $$9314 = $$8313; //@line 11945
    $312 = $317; //@line 11945
   }
   if (!$$2) {
    $$3291 = $$2290; //@line 11949
   } else {
    _free($$9314); //@line 11951
    _free($312); //@line 11952
    $$3291 = $$2290; //@line 11953
   }
  }
 } while (0);
 if ($314 | 0) {
  ___unlockfile($0); //@line 11959
 }
 STACKTOP = sp; //@line 11961
 return $$3291 | 0; //@line 11961
}
function _decfloat($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0329 = 0, $$0332488 = 0, $$0333 = 0, $$0334 = 0, $$0336484 = 0, $$0340494 = 0, $$0341$lcssa = 0, $$0341461 = 0, $$0341462 = 0, $$0341463 = 0, $$0341511 = 0, $$0345$lcssa = 0, $$0345465 = 0, $$0345466 = 0, $$0345467 = 0, $$0345510 = 0, $$0350$lcssa553 = 0, $$0350492 = 0, $$0360 = 0.0, $$0361 = 0.0, $$0365482 = 0.0, $$0372 = 0, $$0380 = 0, $$0380$ph = 0, $$0385$lcssa552 = 0, $$0385491 = 0, $$0393 = 0, $$0396 = 0, $$0401$lcssa = 0, $$0401471 = 0, $$0401472 = 0, $$0401473 = 0, $$0401507 = 0, $$1 = 0.0, $$10 = 0, $$1330$be = 0, $$1330$ph = 0, $$1335 = 0, $$1337 = 0, $$1362 = 0.0, $$1366 = 0.0, $$1373 = 0, $$1373$ph446 = 0, $$1381 = 0, $$1381$ph = 0, $$1381$ph557 = 0, $$1394$lcssa = 0, $$1394509 = 0, $$2 = 0, $$2343 = 0, $$2347 = 0, $$2352$ph447 = 0, $$2367 = 0.0, $$2374 = 0, $$2387$ph445 = 0, $$2395 = 0, $$2398 = 0, $$2403 = 0, $$3$be = 0, $$3$lcssa = 0, $$3344501 = 0, $$3348 = 0, $$3364 = 0.0, $$3368 = 0.0, $$3383 = 0, $$3399$lcssa = 0, $$3399508 = 0, $$3512 = 0, $$423 = 0, $$4349493 = 0, $$4354 = 0, $$4354$ph = 0, $$4354$ph558 = 0, $$4376 = 0, $$4384 = 0, $$4389$ph = 0, $$4389$ph443 = 0, $$4400 = 0, $$4483 = 0, $$5 = 0, $$5$in = 0, $$5355486 = 0, $$5390485 = 0, $$6378$ph = 0, $$6487 = 0, $$9481 = 0, $$pre = 0, $$pre551 = 0, $$sink = 0, $$sink419$off0 = 0, $10 = 0, $100 = 0, $105 = 0, $106 = 0, $108 = 0, $109 = 0, $122 = 0, $124 = 0, $134 = 0, $136 = 0, $148 = 0, $150 = 0, $17 = 0, $172 = 0, $184 = 0, $188 = 0, $191 = 0, $193 = 0, $194 = 0, $195 = 0, $198 = 0, $212 = 0, $213 = 0, $214 = 0, $218 = 0, $220 = 0, $222 = 0, $223 = 0, $229 = 0, $231 = 0, $236 = 0, $243 = 0, $246 = 0, $249 = 0, $25 = 0, $256 = 0, $259 = 0, $26 = 0, $261 = 0, $264 = 0, $267 = 0, $268 = 0, $27 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $277 = 0, $28 = 0, $289 = 0, $29 = 0, $294 = 0, $299 = 0, $302 = 0, $311 = 0.0, $312 = 0.0, $313 = 0, $314 = 0, $315 = 0, $320 = 0.0, $323 = 0.0, $327 = 0, $330 = 0, $354 = 0.0, $359 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $39 = 0, $41 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $54 = 0, $55 = 0, $59 = 0, $6 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $81 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $or$cond418 = 0, $or$cond424 = 0, $sum = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1611
 STACKTOP = STACKTOP + 512 | 0; //@line 1612
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(512); //@line 1612
 $6 = sp; //@line 1613
 $sum = $3 + $2 | 0; //@line 1614
 $7 = 0 - $sum | 0; //@line 1615
 $8 = $0 + 4 | 0; //@line 1616
 $9 = $0 + 100 | 0; //@line 1617
 $$0329 = $1; //@line 1618
 $$0396 = 0; //@line 1618
 L1 : while (1) {
  switch ($$0329 | 0) {
  case 46:
   {
    label = 6; //@line 1622
    break L1;
    break;
   }
  case 48:
   {
    break;
   }
  default:
   {
    $$0393 = 0; //@line 1630
    $$2 = $$0329; //@line 1630
    $$2398 = $$0396; //@line 1630
    $368 = 0; //@line 1630
    $369 = 0; //@line 1630
    break L1;
   }
  }
  $10 = HEAP32[$8 >> 2] | 0; //@line 1634
  if ($10 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
   HEAP32[$8 >> 2] = $10 + 1; //@line 1639
   $$0329 = HEAPU8[$10 >> 0] | 0; //@line 1642
   $$0396 = 1; //@line 1642
   continue;
  } else {
   $$0329 = ___shgetc($0) | 0; //@line 1646
   $$0396 = 1; //@line 1646
   continue;
  }
 }
 if ((label | 0) == 6) {
  $17 = HEAP32[$8 >> 2] | 0; //@line 1651
  if ($17 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
   HEAP32[$8 >> 2] = $17 + 1; //@line 1656
   $$1330$ph = HEAPU8[$17 >> 0] | 0; //@line 1659
  } else {
   $$1330$ph = ___shgetc($0) | 0; //@line 1662
  }
  if (($$1330$ph | 0) == 48) {
   $25 = 0; //@line 1666
   $26 = 0; //@line 1666
   while (1) {
    $27 = _i64Add($25 | 0, $26 | 0, -1, -1) | 0; //@line 1668
    $28 = tempRet0; //@line 1669
    $29 = HEAP32[$8 >> 2] | 0; //@line 1670
    if ($29 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
     HEAP32[$8 >> 2] = $29 + 1; //@line 1675
     $$1330$be = HEAPU8[$29 >> 0] | 0; //@line 1678
    } else {
     $$1330$be = ___shgetc($0) | 0; //@line 1681
    }
    if (($$1330$be | 0) == 48) {
     $25 = $27; //@line 1685
     $26 = $28; //@line 1685
    } else {
     $$0393 = 1; //@line 1687
     $$2 = $$1330$be; //@line 1687
     $$2398 = 1; //@line 1687
     $368 = $27; //@line 1687
     $369 = $28; //@line 1687
     break;
    }
   }
  } else {
   $$0393 = 1; //@line 1692
   $$2 = $$1330$ph; //@line 1692
   $$2398 = $$0396; //@line 1692
   $368 = 0; //@line 1692
   $369 = 0; //@line 1692
  }
 }
 HEAP32[$6 >> 2] = 0; //@line 1695
 $37 = $$2 + -48 | 0; //@line 1696
 $39 = ($$2 | 0) == 46; //@line 1698
 L20 : do {
  if ($39 | $37 >>> 0 < 10) {
   $41 = $6 + 496 | 0; //@line 1702
   $$0341511 = 0; //@line 1703
   $$0345510 = 0; //@line 1703
   $$0401507 = 0; //@line 1703
   $$1394509 = $$0393; //@line 1703
   $$3399508 = $$2398; //@line 1703
   $$3512 = $$2; //@line 1703
   $370 = $39; //@line 1703
   $371 = $37; //@line 1703
   $372 = $368; //@line 1703
   $373 = $369; //@line 1703
   $44 = 0; //@line 1703
   $45 = 0; //@line 1703
   L22 : while (1) {
    do {
     if ($370) {
      if (!$$1394509) {
       $$2343 = $$0341511; //@line 1709
       $$2347 = $$0345510; //@line 1709
       $$2395 = 1; //@line 1709
       $$2403 = $$0401507; //@line 1709
       $$4400 = $$3399508; //@line 1709
       $374 = $44; //@line 1709
       $375 = $45; //@line 1709
       $376 = $44; //@line 1709
       $377 = $45; //@line 1709
      } else {
       break L22;
      }
     } else {
      $46 = _i64Add($44 | 0, $45 | 0, 1, 0) | 0; //@line 1715
      $47 = tempRet0; //@line 1716
      $48 = ($$3512 | 0) != 48; //@line 1717
      if (($$0345510 | 0) >= 125) {
       if (!$48) {
        $$2343 = $$0341511; //@line 1720
        $$2347 = $$0345510; //@line 1720
        $$2395 = $$1394509; //@line 1720
        $$2403 = $$0401507; //@line 1720
        $$4400 = $$3399508; //@line 1720
        $374 = $372; //@line 1720
        $375 = $373; //@line 1720
        $376 = $46; //@line 1720
        $377 = $47; //@line 1720
        break;
       }
       HEAP32[$41 >> 2] = HEAP32[$41 >> 2] | 1; //@line 1725
       $$2343 = $$0341511; //@line 1726
       $$2347 = $$0345510; //@line 1726
       $$2395 = $$1394509; //@line 1726
       $$2403 = $$0401507; //@line 1726
       $$4400 = $$3399508; //@line 1726
       $374 = $372; //@line 1726
       $375 = $373; //@line 1726
       $376 = $46; //@line 1726
       $377 = $47; //@line 1726
       break;
      }
      $$pre551 = $6 + ($$0345510 << 2) | 0; //@line 1731
      if (!$$0341511) {
       $$sink = $371; //@line 1733
      } else {
       $$sink = $$3512 + -48 + ((HEAP32[$$pre551 >> 2] | 0) * 10 | 0) | 0; //@line 1739
      }
      HEAP32[$$pre551 >> 2] = $$sink; //@line 1741
      $54 = $$0341511 + 1 | 0; //@line 1742
      $55 = ($54 | 0) == 9; //@line 1743
      $$2343 = $55 ? 0 : $54; //@line 1747
      $$2347 = $$0345510 + ($55 & 1) | 0; //@line 1747
      $$2395 = $$1394509; //@line 1747
      $$2403 = $48 ? $46 : $$0401507; //@line 1747
      $$4400 = 1; //@line 1747
      $374 = $372; //@line 1747
      $375 = $373; //@line 1747
      $376 = $46; //@line 1747
      $377 = $47; //@line 1747
     }
    } while (0);
    $59 = HEAP32[$8 >> 2] | 0; //@line 1750
    if ($59 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
     HEAP32[$8 >> 2] = $59 + 1; //@line 1755
     $$3$be = HEAPU8[$59 >> 0] | 0; //@line 1758
    } else {
     $$3$be = ___shgetc($0) | 0; //@line 1761
    }
    $371 = $$3$be + -48 | 0; //@line 1763
    $370 = ($$3$be | 0) == 46; //@line 1765
    if (!($370 | $371 >>> 0 < 10)) {
     $$0341$lcssa = $$2343; //@line 1770
     $$0345$lcssa = $$2347; //@line 1770
     $$0401$lcssa = $$2403; //@line 1770
     $$1394$lcssa = $$2395; //@line 1770
     $$3$lcssa = $$3$be; //@line 1770
     $$3399$lcssa = $$4400; //@line 1770
     $72 = $376; //@line 1770
     $73 = $374; //@line 1770
     $75 = $377; //@line 1770
     $76 = $375; //@line 1770
     label = 29; //@line 1771
     break L20;
    } else {
     $$0341511 = $$2343; //@line 1768
     $$0345510 = $$2347; //@line 1768
     $$0401507 = $$2403; //@line 1768
     $$1394509 = $$2395; //@line 1768
     $$3399508 = $$4400; //@line 1768
     $$3512 = $$3$be; //@line 1768
     $372 = $374; //@line 1768
     $373 = $375; //@line 1768
     $44 = $376; //@line 1768
     $45 = $377; //@line 1768
    }
   }
   $$0341463 = $$0341511; //@line 1776
   $$0345467 = $$0345510; //@line 1776
   $$0401473 = $$0401507; //@line 1776
   $378 = $44; //@line 1776
   $379 = $45; //@line 1776
   $380 = $372; //@line 1776
   $381 = $373; //@line 1776
   $382 = ($$3399508 | 0) != 0; //@line 1776
   label = 37; //@line 1777
  } else {
   $$0341$lcssa = 0; //@line 1779
   $$0345$lcssa = 0; //@line 1779
   $$0401$lcssa = 0; //@line 1779
   $$1394$lcssa = $$0393; //@line 1779
   $$3$lcssa = $$2; //@line 1779
   $$3399$lcssa = $$2398; //@line 1779
   $72 = 0; //@line 1779
   $73 = $368; //@line 1779
   $75 = 0; //@line 1779
   $76 = $369; //@line 1779
   label = 29; //@line 1780
  }
 } while (0);
 do {
  if ((label | 0) == 29) {
   $70 = ($$1394$lcssa | 0) == 0; //@line 1785
   $71 = $70 ? $72 : $73; //@line 1786
   $74 = $70 ? $75 : $76; //@line 1787
   $77 = ($$3399$lcssa | 0) != 0; //@line 1788
   if (!($77 & ($$3$lcssa | 32 | 0) == 101)) {
    if (($$3$lcssa | 0) > -1) {
     $$0341463 = $$0341$lcssa; //@line 1795
     $$0345467 = $$0345$lcssa; //@line 1795
     $$0401473 = $$0401$lcssa; //@line 1795
     $378 = $72; //@line 1795
     $379 = $75; //@line 1795
     $380 = $71; //@line 1795
     $381 = $74; //@line 1795
     $382 = $77; //@line 1795
     label = 37; //@line 1796
     break;
    } else {
     $$0341462 = $$0341$lcssa; //@line 1799
     $$0345466 = $$0345$lcssa; //@line 1799
     $$0401472 = $$0401$lcssa; //@line 1799
     $383 = $72; //@line 1799
     $384 = $75; //@line 1799
     $385 = $77; //@line 1799
     $386 = $71; //@line 1799
     $387 = $74; //@line 1799
     label = 39; //@line 1800
     break;
    }
   }
   $80 = _scanexp($0, $5) | 0; //@line 1804
   $81 = tempRet0; //@line 1805
   if (($80 | 0) == 0 & ($81 | 0) == -2147483648) {
    if (!$5) {
     ___shlim($0, 0); //@line 1812
     $$1 = 0.0; //@line 1813
     break;
    }
    if (!(HEAP32[$9 >> 2] | 0)) {
     $90 = 0; //@line 1819
     $91 = 0; //@line 1819
    } else {
     HEAP32[$8 >> 2] = (HEAP32[$8 >> 2] | 0) + -1; //@line 1823
     $90 = 0; //@line 1824
     $91 = 0; //@line 1824
    }
   } else {
    $90 = $80; //@line 1827
    $91 = $81; //@line 1827
   }
   $92 = _i64Add($90 | 0, $91 | 0, $71 | 0, $74 | 0) | 0; //@line 1829
   $$0341461 = $$0341$lcssa; //@line 1831
   $$0345465 = $$0345$lcssa; //@line 1831
   $$0401471 = $$0401$lcssa; //@line 1831
   $105 = $92; //@line 1831
   $106 = $72; //@line 1831
   $108 = tempRet0; //@line 1831
   $109 = $75; //@line 1831
   label = 41; //@line 1832
  }
 } while (0);
 if ((label | 0) == 37) {
  if (!(HEAP32[$9 >> 2] | 0)) {
   $$0341462 = $$0341463; //@line 1839
   $$0345466 = $$0345467; //@line 1839
   $$0401472 = $$0401473; //@line 1839
   $383 = $378; //@line 1839
   $384 = $379; //@line 1839
   $385 = $382; //@line 1839
   $386 = $380; //@line 1839
   $387 = $381; //@line 1839
   label = 39; //@line 1840
  } else {
   HEAP32[$8 >> 2] = (HEAP32[$8 >> 2] | 0) + -1; //@line 1844
   if ($382) {
    $$0341461 = $$0341463; //@line 1846
    $$0345465 = $$0345467; //@line 1846
    $$0401471 = $$0401473; //@line 1846
    $105 = $380; //@line 1846
    $106 = $378; //@line 1846
    $108 = $381; //@line 1846
    $109 = $379; //@line 1846
    label = 41; //@line 1847
   } else {
    label = 40; //@line 1849
   }
  }
 }
 if ((label | 0) == 39) {
  if ($385) {
   $$0341461 = $$0341462; //@line 1855
   $$0345465 = $$0345466; //@line 1855
   $$0401471 = $$0401472; //@line 1855
   $105 = $386; //@line 1855
   $106 = $383; //@line 1855
   $108 = $387; //@line 1855
   $109 = $384; //@line 1855
   label = 41; //@line 1856
  } else {
   label = 40; //@line 1858
  }
 }
 do {
  if ((label | 0) == 40) {
   HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1864
   ___shlim($0, 0); //@line 1865
   $$1 = 0.0; //@line 1866
  } else if ((label | 0) == 41) {
   $100 = HEAP32[$6 >> 2] | 0; //@line 1869
   if (!$100) {
    $$1 = +($4 | 0) * 0.0; //@line 1874
    break;
   }
   if ((($109 | 0) < 0 | ($109 | 0) == 0 & $106 >>> 0 < 10) & (($105 | 0) == ($106 | 0) & ($108 | 0) == ($109 | 0))) {
    if (($2 | 0) > 30 | ($100 >>> $2 | 0) == 0) {
     $$1 = +($4 | 0) * +($100 >>> 0); //@line 1895
     break;
    }
   }
   $122 = ($3 | 0) / -2 | 0; //@line 1899
   $124 = (($122 | 0) < 0) << 31 >> 31; //@line 1901
   if (($108 | 0) > ($124 | 0) | ($108 | 0) == ($124 | 0) & $105 >>> 0 > $122 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1909
    $$1 = +($4 | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308; //@line 1913
    break;
   }
   $134 = $3 + -106 | 0; //@line 1916
   $136 = (($134 | 0) < 0) << 31 >> 31; //@line 1918
   if (($108 | 0) < ($136 | 0) | ($108 | 0) == ($136 | 0) & $105 >>> 0 < $134 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1926
    $$1 = +($4 | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308; //@line 1930
    break;
   }
   if (!$$0341461) {
    $$3348 = $$0345465; //@line 1935
   } else {
    if (($$0341461 | 0) < 9) {
     $148 = $6 + ($$0345465 << 2) | 0; //@line 1939
     $$3344501 = $$0341461; //@line 1941
     $150 = HEAP32[$148 >> 2] | 0; //@line 1941
     while (1) {
      $150 = $150 * 10 | 0; //@line 1943
      if (($$3344501 | 0) >= 8) {
       break;
      } else {
       $$3344501 = $$3344501 + 1 | 0; //@line 1947
      }
     }
     HEAP32[$148 >> 2] = $150; //@line 1952
    }
    $$3348 = $$0345465 + 1 | 0; //@line 1955
   }
   if (($$0401471 | 0) < 9) {
    if (($$0401471 | 0) <= ($105 | 0) & ($105 | 0) < 18) {
     if (($105 | 0) == 9) {
      $$1 = +($4 | 0) * +((HEAP32[$6 >> 2] | 0) >>> 0); //@line 1969
      break;
     }
     if (($105 | 0) < 9) {
      $$1 = +($4 | 0) * +((HEAP32[$6 >> 2] | 0) >>> 0) / +(HEAP32[1264 + (8 - $105 << 2) >> 2] | 0); //@line 1983
      break;
     }
     $172 = $2 + 27 + (Math_imul($105, -3) | 0) | 0; //@line 1988
     $$pre = HEAP32[$6 >> 2] | 0; //@line 1990
     if (($172 | 0) > 30 | ($$pre >>> $172 | 0) == 0) {
      $$1 = +($4 | 0) * +($$pre >>> 0) * +(HEAP32[1264 + ($105 + -10 << 2) >> 2] | 0); //@line 2003
      break;
     }
    }
   }
   $184 = ($105 | 0) % 9 | 0; //@line 2008
   if (!$184) {
    $$0380$ph = 0; //@line 2011
    $$1373$ph446 = $$3348; //@line 2011
    $$2352$ph447 = 0; //@line 2011
    $$2387$ph445 = $105; //@line 2011
   } else {
    $188 = ($105 | 0) > -1 ? $184 : $184 + 9 | 0; //@line 2015
    $191 = HEAP32[1264 + (8 - $188 << 2) >> 2] | 0; //@line 2018
    if (!$$3348) {
     $$0350$lcssa553 = 0; //@line 2021
     $$0372 = 0; //@line 2021
     $$0385$lcssa552 = $105; //@line 2021
    } else {
     $193 = 1e9 / ($191 | 0) | 0; //@line 2023
     $$0340494 = 0; //@line 2024
     $$0350492 = 0; //@line 2024
     $$0385491 = $105; //@line 2024
     $$4349493 = 0; //@line 2024
     do {
      $194 = $6 + ($$4349493 << 2) | 0; //@line 2026
      $195 = HEAP32[$194 >> 2] | 0; //@line 2027
      $198 = (($195 >>> 0) / ($191 >>> 0) | 0) + $$0340494 | 0; //@line 2030
      HEAP32[$194 >> 2] = $198; //@line 2031
      $$0340494 = Math_imul($193, ($195 >>> 0) % ($191 >>> 0) | 0) | 0; //@line 2032
      $or$cond418 = ($$4349493 | 0) == ($$0350492 | 0) & ($198 | 0) == 0; //@line 2035
      $$0385491 = $or$cond418 ? $$0385491 + -9 | 0 : $$0385491; //@line 2039
      $$0350492 = $or$cond418 ? $$0350492 + 1 & 127 : $$0350492; //@line 2040
      $$4349493 = $$4349493 + 1 | 0; //@line 2041
     } while (($$4349493 | 0) != ($$3348 | 0));
     if (!$$0340494) {
      $$0350$lcssa553 = $$0350492; //@line 2051
      $$0372 = $$3348; //@line 2051
      $$0385$lcssa552 = $$0385491; //@line 2051
     } else {
      HEAP32[$6 + ($$3348 << 2) >> 2] = $$0340494; //@line 2055
      $$0350$lcssa553 = $$0350492; //@line 2056
      $$0372 = $$3348 + 1 | 0; //@line 2056
      $$0385$lcssa552 = $$0385491; //@line 2056
     }
    }
    $$0380$ph = 0; //@line 2061
    $$1373$ph446 = $$0372; //@line 2061
    $$2352$ph447 = $$0350$lcssa553; //@line 2061
    $$2387$ph445 = 9 - $188 + $$0385$lcssa552 | 0; //@line 2061
   }
   L101 : while (1) {
    $212 = ($$2387$ph445 | 0) < 18; //@line 2064
    $213 = ($$2387$ph445 | 0) == 18; //@line 2065
    $214 = $6 + ($$2352$ph447 << 2) | 0; //@line 2066
    $$0380 = $$0380$ph; //@line 2067
    $$1373 = $$1373$ph446; //@line 2067
    while (1) {
     if (!$212) {
      if (!$213) {
       $$1381$ph = $$0380; //@line 2071
       $$4354$ph = $$2352$ph447; //@line 2071
       $$4389$ph443 = $$2387$ph445; //@line 2071
       $$6378$ph = $$1373; //@line 2071
       break L101;
      }
      if ((HEAP32[$214 >> 2] | 0) >>> 0 >= 9007199) {
       $$1381$ph = $$0380; //@line 2077
       $$4354$ph = $$2352$ph447; //@line 2077
       $$4389$ph443 = 18; //@line 2077
       $$6378$ph = $$1373; //@line 2077
       break L101;
      }
     }
     $$0334 = 0; //@line 2082
     $$2374 = $$1373; //@line 2082
     $$5$in = $$1373 + 127 | 0; //@line 2082
     while (1) {
      $$5 = $$5$in & 127; //@line 2084
      $218 = $6 + ($$5 << 2) | 0; //@line 2085
      $220 = _bitshift64Shl(HEAP32[$218 >> 2] | 0, 0, 29) | 0; //@line 2087
      $222 = _i64Add($220 | 0, tempRet0 | 0, $$0334 | 0, 0) | 0; //@line 2089
      $223 = tempRet0; //@line 2090
      if ($223 >>> 0 > 0 | ($223 | 0) == 0 & $222 >>> 0 > 1e9) {
       $229 = ___udivdi3($222 | 0, $223 | 0, 1e9, 0) | 0; //@line 2097
       $231 = ___uremdi3($222 | 0, $223 | 0, 1e9, 0) | 0; //@line 2099
       $$1335 = $229; //@line 2101
       $$sink419$off0 = $231; //@line 2101
      } else {
       $$1335 = 0; //@line 2103
       $$sink419$off0 = $222; //@line 2103
      }
      HEAP32[$218 >> 2] = $$sink419$off0; //@line 2105
      $236 = ($$5 | 0) == ($$2352$ph447 | 0); //@line 2109
      $$2374 = ($$sink419$off0 | 0) == 0 & ((($$5 | 0) != ($$2374 + 127 & 127 | 0) | $236) ^ 1) ? $$5 : $$2374; //@line 2114
      if ($236) {
       break;
      } else {
       $$0334 = $$1335; //@line 2119
       $$5$in = $$5 + -1 | 0; //@line 2119
      }
     }
     $$0380 = $$0380 + -29 | 0; //@line 2122
     if ($$1335 | 0) {
      break;
     } else {
      $$1373 = $$2374; //@line 2125
     }
    }
    $243 = $$2352$ph447 + 127 & 127; //@line 2132
    $246 = $$2374 + 127 & 127; //@line 2135
    $249 = $6 + (($$2374 + 126 & 127) << 2) | 0; //@line 2138
    if (($243 | 0) == ($$2374 | 0)) {
     HEAP32[$249 >> 2] = HEAP32[$249 >> 2] | HEAP32[$6 + ($246 << 2) >> 2]; //@line 2144
     $$4376 = $246; //@line 2145
    } else {
     $$4376 = $$2374; //@line 2147
    }
    HEAP32[$6 + ($243 << 2) >> 2] = $$1335; //@line 2150
    $$0380$ph = $$0380; //@line 2151
    $$1373$ph446 = $$4376; //@line 2151
    $$2352$ph447 = $243; //@line 2151
    $$2387$ph445 = $$2387$ph445 + 9 | 0; //@line 2151
   }
   L119 : while (1) {
    $289 = $$6378$ph + 1 & 127; //@line 2155
    $294 = $6 + (($$6378$ph + 127 & 127) << 2) | 0; //@line 2158
    $$1381$ph557 = $$1381$ph; //@line 2159
    $$4354$ph558 = $$4354$ph; //@line 2159
    $$4389$ph = $$4389$ph443; //@line 2159
    while (1) {
     $267 = ($$4389$ph | 0) == 18; //@line 2161
     $$423 = ($$4389$ph | 0) > 27 ? 9 : 1; //@line 2163
     $$1381 = $$1381$ph557; //@line 2164
     $$4354 = $$4354$ph558; //@line 2164
     while (1) {
      $$0336484 = 0; //@line 2166
      while (1) {
       $256 = $$0336484 + $$4354 & 127; //@line 2169
       if (($256 | 0) == ($$6378$ph | 0)) {
        $$1337 = 2; //@line 2172
        label = 88; //@line 2173
        break;
       }
       $259 = HEAP32[$6 + ($256 << 2) >> 2] | 0; //@line 2177
       $261 = HEAP32[1296 + ($$0336484 << 2) >> 2] | 0; //@line 2179
       if ($259 >>> 0 < $261 >>> 0) {
        $$1337 = 2; //@line 2182
        label = 88; //@line 2183
        break;
       }
       if ($259 >>> 0 > $261 >>> 0) {
        break;
       }
       $264 = $$0336484 + 1 | 0; //@line 2190
       if (($$0336484 | 0) < 1) {
        $$0336484 = $264; //@line 2193
       } else {
        $$1337 = $264; //@line 2195
        label = 88; //@line 2196
        break;
       }
      }
      if ((label | 0) == 88) {
       label = 0; //@line 2201
       if ($267 & ($$1337 | 0) == 2) {
        $$0365482 = 0.0; //@line 2205
        $$4483 = 0; //@line 2205
        $$9481 = $$6378$ph; //@line 2205
        break L119;
       }
      }
      $268 = $$423 + $$1381 | 0; //@line 2209
      if (($$4354 | 0) == ($$6378$ph | 0)) {
       $$1381 = $268; //@line 2212
       $$4354 = $$6378$ph; //@line 2212
      } else {
       break;
      }
     }
     $271 = (1 << $$423) + -1 | 0; //@line 2218
     $272 = 1e9 >>> $$423; //@line 2219
     $$0332488 = 0; //@line 2220
     $$5355486 = $$4354; //@line 2220
     $$5390485 = $$4389$ph; //@line 2220
     $$6487 = $$4354; //@line 2220
     do {
      $273 = $6 + ($$6487 << 2) | 0; //@line 2222
      $274 = HEAP32[$273 >> 2] | 0; //@line 2223
      $277 = ($274 >>> $$423) + $$0332488 | 0; //@line 2226
      HEAP32[$273 >> 2] = $277; //@line 2227
      $$0332488 = Math_imul($274 & $271, $272) | 0; //@line 2228
      $or$cond424 = ($$6487 | 0) == ($$5355486 | 0) & ($277 | 0) == 0; //@line 2231
      $$5390485 = $or$cond424 ? $$5390485 + -9 | 0 : $$5390485; //@line 2235
      $$5355486 = $or$cond424 ? $$5355486 + 1 & 127 : $$5355486; //@line 2236
      $$6487 = $$6487 + 1 & 127; //@line 2238
     } while (($$6487 | 0) != ($$6378$ph | 0));
     if (!$$0332488) {
      $$1381$ph557 = $268; //@line 2248
      $$4354$ph558 = $$5355486; //@line 2248
      $$4389$ph = $$5390485; //@line 2248
      continue;
     }
     if (($289 | 0) != ($$5355486 | 0)) {
      break;
     }
     HEAP32[$294 >> 2] = HEAP32[$294 >> 2] | 1; //@line 2257
     $$1381$ph557 = $268; //@line 2258
     $$4354$ph558 = $$5355486; //@line 2258
     $$4389$ph = $$5390485; //@line 2258
    }
    HEAP32[$6 + ($$6378$ph << 2) >> 2] = $$0332488; //@line 2261
    $$1381$ph = $268; //@line 2262
    $$4354$ph = $$5355486; //@line 2262
    $$4389$ph443 = $$5390485; //@line 2262
    $$6378$ph = $289; //@line 2262
   }
   while (1) {
    $299 = $$4483 + $$4354 & 127; //@line 2266
    $302 = $$9481 + 1 & 127; //@line 2269
    if (($299 | 0) == ($$9481 | 0)) {
     HEAP32[$6 + ($302 + -1 << 2) >> 2] = 0; //@line 2273
     $$10 = $302; //@line 2274
    } else {
     $$10 = $$9481; //@line 2276
    }
    $$0365482 = $$0365482 * 1.0e9 + +((HEAP32[$6 + ($299 << 2) >> 2] | 0) >>> 0); //@line 2282
    $$4483 = $$4483 + 1 | 0; //@line 2283
    if (($$4483 | 0) == 2) {
     break;
    } else {
     $$9481 = $$10; //@line 2288
    }
   }
   $311 = +($4 | 0); //@line 2291
   $312 = $$0365482 * $311; //@line 2292
   $313 = $$1381 + 53 | 0; //@line 2293
   $314 = $313 - $3 | 0; //@line 2294
   $315 = ($314 | 0) < ($2 | 0); //@line 2295
   $$0333 = $315 ? ($314 | 0) > 0 ? $314 : 0 : $2; //@line 2298
   if (($$0333 | 0) < 53) {
    $320 = +_copysignl(+_scalbn(1.0, 105 - $$0333 | 0), $312); //@line 2303
    $323 = +_fmodl($312, +_scalbn(1.0, 53 - $$0333 | 0)); //@line 2306
    $$0360 = $320; //@line 2309
    $$0361 = $323; //@line 2309
    $$1366 = $320 + ($312 - $323); //@line 2309
   } else {
    $$0360 = 0.0; //@line 2311
    $$0361 = 0.0; //@line 2311
    $$1366 = $312; //@line 2311
   }
   $327 = $$4354 + 2 & 127; //@line 2314
   if (($327 | 0) == ($$10 | 0)) {
    $$3364 = $$0361; //@line 2317
   } else {
    $330 = HEAP32[$6 + ($327 << 2) >> 2] | 0; //@line 2320
    do {
     if ($330 >>> 0 < 5e8) {
      if (!$330) {
       if (($$4354 + 3 & 127 | 0) == ($$10 | 0)) {
        $$1362 = $$0361; //@line 2330
        break;
       }
      }
      $$1362 = $311 * .25 + $$0361; //@line 2336
     } else {
      if (($330 | 0) != 5e8) {
       $$1362 = $311 * .75 + $$0361; //@line 2342
       break;
      }
      if (($$4354 + 3 & 127 | 0) == ($$10 | 0)) {
       $$1362 = $311 * .5 + $$0361; //@line 2351
       break;
      } else {
       $$1362 = $311 * .75 + $$0361; //@line 2356
       break;
      }
     }
    } while (0);
    if ((53 - $$0333 | 0) > 1) {
     if (+_fmodl($$1362, 1.0) != 0.0) {
      $$3364 = $$1362; //@line 2367
     } else {
      $$3364 = $$1362 + 1.0; //@line 2370
     }
    } else {
     $$3364 = $$1362; //@line 2373
    }
   }
   $354 = $$1366 + $$3364 - $$0360; //@line 2377
   do {
    if (($313 & 2147483647 | 0) > (-2 - $sum | 0)) {
     $359 = !(+Math_abs(+$354) >= 9007199254740992.0); //@line 2384
     $$3383 = $$1381 + (($359 ^ 1) & 1) | 0; //@line 2388
     $$2367 = $359 ? $354 : $354 * .5; //@line 2389
     if (($$3383 + 50 | 0) <= ($7 | 0)) {
      if (!($$3364 != 0.0 & ($315 & (($$0333 | 0) != ($314 | 0) | $359)))) {
       $$3368 = $$2367; //@line 2399
       $$4384 = $$3383; //@line 2399
       break;
      }
     }
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 2404
     $$3368 = $$2367; //@line 2405
     $$4384 = $$3383; //@line 2405
    } else {
     $$3368 = $354; //@line 2407
     $$4384 = $$1381; //@line 2407
    }
   } while (0);
   $$1 = +_scalbnl($$3368, $$4384); //@line 2411
  }
 } while (0);
 STACKTOP = sp; //@line 2414
 return +$$1;
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4783
 STACKTOP = STACKTOP + 560 | 0; //@line 4784
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 4784
 $6 = sp + 8 | 0; //@line 4785
 $7 = sp; //@line 4786
 $8 = sp + 524 | 0; //@line 4787
 $9 = $8; //@line 4788
 $10 = sp + 512 | 0; //@line 4789
 HEAP32[$7 >> 2] = 0; //@line 4790
 $11 = $10 + 12 | 0; //@line 4791
 ___DOUBLE_BITS_677($1) | 0; //@line 4792
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 4797
  $$0520 = 1; //@line 4797
  $$0521 = 3410; //@line 4797
 } else {
  $$0471 = $1; //@line 4808
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 4808
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3411 : 3416 : 3413; //@line 4808
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 4810
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 4819
   $31 = $$0520 + 3 | 0; //@line 4824
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 4826
   _out_670($0, $$0521, $$0520); //@line 4827
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3437 : 3441 : $27 ? 3429 : 3433, 3); //@line 4828
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 4830
   $$sink560 = $31; //@line 4831
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 4834
   $36 = $35 != 0.0; //@line 4835
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 4839
   }
   $39 = $5 | 32; //@line 4841
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 4844
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 4847
    $44 = $$0520 | 2; //@line 4848
    $46 = 12 - $3 | 0; //@line 4850
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 4855
     } else {
      $$0509585 = 8.0; //@line 4857
      $$1508586 = $46; //@line 4857
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 4859
       $$0509585 = $$0509585 * 16.0; //@line 4860
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 4875
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 4880
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 4885
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 4888
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 4891
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 4894
     HEAP8[$68 >> 0] = 48; //@line 4895
     $$0511 = $68; //@line 4896
    } else {
     $$0511 = $66; //@line 4898
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 4905
    $76 = $$0511 + -2 | 0; //@line 4908
    HEAP8[$76 >> 0] = $5 + 15; //@line 4909
    $77 = ($3 | 0) < 1; //@line 4910
    $79 = ($4 & 8 | 0) == 0; //@line 4912
    $$0523 = $8; //@line 4913
    $$2473 = $$1472; //@line 4913
    while (1) {
     $80 = ~~$$2473; //@line 4915
     $86 = $$0523 + 1 | 0; //@line 4921
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3445 + $80 >> 0]; //@line 4922
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 4925
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 4934
      } else {
       HEAP8[$86 >> 0] = 46; //@line 4937
       $$1524 = $$0523 + 2 | 0; //@line 4938
      }
     } else {
      $$1524 = $86; //@line 4941
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 4945
     }
    }
    $$pre693 = $$1524; //@line 4951
    if (!$3) {
     label = 24; //@line 4953
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 4961
      $$sink = $3 + 2 | 0; //@line 4961
     } else {
      label = 24; //@line 4963
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 4967
     $$pre$phi691Z2D = $101; //@line 4968
     $$sink = $101; //@line 4968
    }
    $104 = $11 - $76 | 0; //@line 4972
    $106 = $104 + $44 + $$sink | 0; //@line 4974
    _pad_676($0, 32, $2, $106, $4); //@line 4975
    _out_670($0, $$0521$, $44); //@line 4976
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 4978
    _out_670($0, $8, $$pre$phi691Z2D); //@line 4979
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 4981
    _out_670($0, $76, $104); //@line 4982
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 4984
    $$sink560 = $106; //@line 4985
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 4989
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 4993
    HEAP32[$7 >> 2] = $113; //@line 4994
    $$3 = $35 * 268435456.0; //@line 4995
    $$pr = $113; //@line 4995
   } else {
    $$3 = $35; //@line 4998
    $$pr = HEAP32[$7 >> 2] | 0; //@line 4998
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 5002
   $$0498 = $$561; //@line 5003
   $$4 = $$3; //@line 5003
   do {
    $116 = ~~$$4 >>> 0; //@line 5005
    HEAP32[$$0498 >> 2] = $116; //@line 5006
    $$0498 = $$0498 + 4 | 0; //@line 5007
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 5010
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 5020
    $$1499662 = $$0498; //@line 5020
    $124 = $$pr; //@line 5020
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 5023
     $$0488655 = $$1499662 + -4 | 0; //@line 5024
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 5027
     } else {
      $$0488657 = $$0488655; //@line 5029
      $$0497656 = 0; //@line 5029
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 5032
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 5034
       $131 = tempRet0; //@line 5035
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 5036
       HEAP32[$$0488657 >> 2] = $132; //@line 5038
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 5039
       $$0488657 = $$0488657 + -4 | 0; //@line 5041
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 5051
      } else {
       $138 = $$1482663 + -4 | 0; //@line 5053
       HEAP32[$138 >> 2] = $$0497656; //@line 5054
       $$2483$ph = $138; //@line 5055
      }
     }
     $$2500 = $$1499662; //@line 5058
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 5064
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 5068
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 5074
     HEAP32[$7 >> 2] = $144; //@line 5075
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 5078
      $$1499662 = $$2500; //@line 5078
      $124 = $144; //@line 5078
     } else {
      $$1482$lcssa = $$2483$ph; //@line 5080
      $$1499$lcssa = $$2500; //@line 5080
      $$pr566 = $144; //@line 5080
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 5085
    $$1499$lcssa = $$0498; //@line 5085
    $$pr566 = $$pr; //@line 5085
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 5091
    $150 = ($39 | 0) == 102; //@line 5092
    $$3484650 = $$1482$lcssa; //@line 5093
    $$3501649 = $$1499$lcssa; //@line 5093
    $152 = $$pr566; //@line 5093
    while (1) {
     $151 = 0 - $152 | 0; //@line 5095
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 5097
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 5101
      $161 = 1e9 >>> $154; //@line 5102
      $$0487644 = 0; //@line 5103
      $$1489643 = $$3484650; //@line 5103
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 5105
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 5109
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 5110
       $$1489643 = $$1489643 + 4 | 0; //@line 5111
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 5122
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 5125
       $$4502 = $$3501649; //@line 5125
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 5128
       $$$3484700 = $$$3484; //@line 5129
       $$4502 = $$3501649 + 4 | 0; //@line 5129
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 5136
      $$4502 = $$3501649; //@line 5136
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 5138
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 5145
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 5147
     HEAP32[$7 >> 2] = $152; //@line 5148
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 5153
      $$3501$lcssa = $$$4502; //@line 5153
      break;
     } else {
      $$3484650 = $$$3484700; //@line 5151
      $$3501649 = $$$4502; //@line 5151
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 5158
    $$3501$lcssa = $$1499$lcssa; //@line 5158
   }
   $185 = $$561; //@line 5161
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 5166
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 5167
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 5170
    } else {
     $$0514639 = $189; //@line 5172
     $$0530638 = 10; //@line 5172
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 5174
      $193 = $$0514639 + 1 | 0; //@line 5175
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 5178
       break;
      } else {
       $$0514639 = $193; //@line 5181
      }
     }
    }
   } else {
    $$1515 = 0; //@line 5186
   }
   $198 = ($39 | 0) == 103; //@line 5191
   $199 = ($$540 | 0) != 0; //@line 5192
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 5195
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 5204
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 5207
    $213 = ($209 | 0) % 9 | 0; //@line 5208
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 5211
     $$1531632 = 10; //@line 5211
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 5214
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 5217
       $$1531632 = $215; //@line 5217
      } else {
       $$1531$lcssa = $215; //@line 5219
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 5224
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 5226
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 5227
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 5230
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 5233
     $$4518 = $$1515; //@line 5233
     $$8 = $$3484$lcssa; //@line 5233
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 5238
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 5239
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 5244
     if (!$$0520) {
      $$1467 = $$$564; //@line 5247
      $$1469 = $$543; //@line 5247
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 5250
      $$1467 = $230 ? -$$$564 : $$$564; //@line 5255
      $$1469 = $230 ? -$$543 : $$543; //@line 5255
     }
     $233 = $217 - $218 | 0; //@line 5257
     HEAP32[$212 >> 2] = $233; //@line 5258
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 5262
      HEAP32[$212 >> 2] = $236; //@line 5263
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 5266
       $$sink547625 = $212; //@line 5266
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 5268
        HEAP32[$$sink547625 >> 2] = 0; //@line 5269
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 5272
         HEAP32[$240 >> 2] = 0; //@line 5273
         $$6 = $240; //@line 5274
        } else {
         $$6 = $$5486626; //@line 5276
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 5279
        HEAP32[$238 >> 2] = $242; //@line 5280
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 5283
         $$sink547625 = $238; //@line 5283
        } else {
         $$5486$lcssa = $$6; //@line 5285
         $$sink547$lcssa = $238; //@line 5285
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 5290
       $$sink547$lcssa = $212; //@line 5290
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 5295
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 5296
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 5299
       $$4518 = $247; //@line 5299
       $$8 = $$5486$lcssa; //@line 5299
      } else {
       $$2516621 = $247; //@line 5301
       $$2532620 = 10; //@line 5301
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 5303
        $251 = $$2516621 + 1 | 0; //@line 5304
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 5307
         $$4518 = $251; //@line 5307
         $$8 = $$5486$lcssa; //@line 5307
         break;
        } else {
         $$2516621 = $251; //@line 5310
        }
       }
      }
     } else {
      $$4492 = $212; //@line 5315
      $$4518 = $$1515; //@line 5315
      $$8 = $$3484$lcssa; //@line 5315
     }
    }
    $253 = $$4492 + 4 | 0; //@line 5318
    $$5519$ph = $$4518; //@line 5321
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 5321
    $$9$ph = $$8; //@line 5321
   } else {
    $$5519$ph = $$1515; //@line 5323
    $$7505$ph = $$3501$lcssa; //@line 5323
    $$9$ph = $$3484$lcssa; //@line 5323
   }
   $$7505 = $$7505$ph; //@line 5325
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 5329
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 5332
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 5336
    } else {
     $$lcssa675 = 1; //@line 5338
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 5342
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 5347
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 5355
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 5355
     } else {
      $$0479 = $5 + -2 | 0; //@line 5359
      $$2476 = $$540$ + -1 | 0; //@line 5359
     }
     $267 = $4 & 8; //@line 5361
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 5366
       if (!$270) {
        $$2529 = 9; //@line 5369
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 5374
         $$3533616 = 10; //@line 5374
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 5376
          $275 = $$1528617 + 1 | 0; //@line 5377
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 5383
           break;
          } else {
           $$1528617 = $275; //@line 5381
          }
         }
        } else {
         $$2529 = 0; //@line 5388
        }
       }
      } else {
       $$2529 = 9; //@line 5392
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 5400
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 5402
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 5404
       $$1480 = $$0479; //@line 5407
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 5407
       $$pre$phi698Z2D = 0; //@line 5407
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 5411
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 5413
       $$1480 = $$0479; //@line 5416
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 5416
       $$pre$phi698Z2D = 0; //@line 5416
       break;
      }
     } else {
      $$1480 = $$0479; //@line 5420
      $$3477 = $$2476; //@line 5420
      $$pre$phi698Z2D = $267; //@line 5420
     }
    } else {
     $$1480 = $5; //@line 5424
     $$3477 = $$540; //@line 5424
     $$pre$phi698Z2D = $4 & 8; //@line 5424
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 5427
   $294 = ($292 | 0) != 0 & 1; //@line 5429
   $296 = ($$1480 | 32 | 0) == 102; //@line 5431
   if ($296) {
    $$2513 = 0; //@line 5435
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 5435
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 5438
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 5441
    $304 = $11; //@line 5442
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 5447
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 5449
      HEAP8[$308 >> 0] = 48; //@line 5450
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 5455
      } else {
       $$1512$lcssa = $308; //@line 5457
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 5462
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 5469
    $318 = $$1512$lcssa + -2 | 0; //@line 5471
    HEAP8[$318 >> 0] = $$1480; //@line 5472
    $$2513 = $318; //@line 5475
    $$pn = $304 - $318 | 0; //@line 5475
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 5480
   _pad_676($0, 32, $2, $323, $4); //@line 5481
   _out_670($0, $$0521, $$0520); //@line 5482
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 5484
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 5487
    $326 = $8 + 9 | 0; //@line 5488
    $327 = $326; //@line 5489
    $328 = $8 + 8 | 0; //@line 5490
    $$5493600 = $$0496$$9; //@line 5491
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 5494
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 5499
       $$1465 = $328; //@line 5500
      } else {
       $$1465 = $330; //@line 5502
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 5509
       $$0464597 = $330; //@line 5510
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 5512
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 5515
        } else {
         $$1465 = $335; //@line 5517
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 5522
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 5527
     $$5493600 = $$5493600 + 4 | 0; //@line 5528
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3461, 1); //@line 5538
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 5544
     $$6494592 = $$5493600; //@line 5544
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 5547
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 5552
       $$0463587 = $347; //@line 5553
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 5555
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 5558
        } else {
         $$0463$lcssa = $351; //@line 5560
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 5565
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 5569
      $$6494592 = $$6494592 + 4 | 0; //@line 5570
      $356 = $$4478593 + -9 | 0; //@line 5571
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 5578
       break;
      } else {
       $$4478593 = $356; //@line 5576
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 5583
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 5586
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 5589
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 5592
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 5593
     $365 = $363; //@line 5594
     $366 = 0 - $9 | 0; //@line 5595
     $367 = $8 + 8 | 0; //@line 5596
     $$5605 = $$3477; //@line 5597
     $$7495604 = $$9$ph; //@line 5597
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 5600
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 5603
       $$0 = $367; //@line 5604
      } else {
       $$0 = $369; //@line 5606
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 5611
        _out_670($0, $$0, 1); //@line 5612
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 5616
         break;
        }
        _out_670($0, 3461, 1); //@line 5619
        $$2 = $375; //@line 5620
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 5624
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 5629
        $$1601 = $$0; //@line 5630
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 5632
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 5635
         } else {
          $$2 = $373; //@line 5637
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 5644
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 5647
      $381 = $$5605 - $378 | 0; //@line 5648
      $$7495604 = $$7495604 + 4 | 0; //@line 5649
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 5656
       break;
      } else {
       $$5605 = $381; //@line 5654
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 5661
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 5664
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 5668
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 5671
   $$sink560 = $323; //@line 5672
  }
 } while (0);
 STACKTOP = sp; //@line 5677
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 5677
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 3355
 STACKTOP = STACKTOP + 64 | 0; //@line 3356
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 3356
 $5 = sp + 16 | 0; //@line 3357
 $6 = sp; //@line 3358
 $7 = sp + 24 | 0; //@line 3359
 $8 = sp + 8 | 0; //@line 3360
 $9 = sp + 20 | 0; //@line 3361
 HEAP32[$5 >> 2] = $1; //@line 3362
 $10 = ($0 | 0) != 0; //@line 3363
 $11 = $7 + 40 | 0; //@line 3364
 $12 = $11; //@line 3365
 $13 = $7 + 39 | 0; //@line 3366
 $14 = $8 + 4 | 0; //@line 3367
 $$0243 = 0; //@line 3368
 $$0247 = 0; //@line 3368
 $$0269 = 0; //@line 3368
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 3377
     $$1248 = -1; //@line 3378
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 3382
     break;
    }
   } else {
    $$1248 = $$0247; //@line 3386
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 3389
  $21 = HEAP8[$20 >> 0] | 0; //@line 3390
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 3393
   break;
  } else {
   $23 = $21; //@line 3396
   $25 = $20; //@line 3396
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 3401
     $27 = $25; //@line 3401
     label = 9; //@line 3402
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 3407
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 3414
   HEAP32[$5 >> 2] = $24; //@line 3415
   $23 = HEAP8[$24 >> 0] | 0; //@line 3417
   $25 = $24; //@line 3417
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 3422
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 3427
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 3430
     $27 = $27 + 2 | 0; //@line 3431
     HEAP32[$5 >> 2] = $27; //@line 3432
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 3439
      break;
     } else {
      $$0249303 = $30; //@line 3436
      label = 9; //@line 3437
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 3447
  if ($10) {
   _out_670($0, $20, $36); //@line 3449
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 3453
   $$0247 = $$1248; //@line 3453
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 3461
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 3462
  if ($43) {
   $$0253 = -1; //@line 3464
   $$1270 = $$0269; //@line 3464
   $$sink = 1; //@line 3464
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 3474
    $$1270 = 1; //@line 3474
    $$sink = 3; //@line 3474
   } else {
    $$0253 = -1; //@line 3476
    $$1270 = $$0269; //@line 3476
    $$sink = 1; //@line 3476
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 3479
  HEAP32[$5 >> 2] = $51; //@line 3480
  $52 = HEAP8[$51 >> 0] | 0; //@line 3481
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 3483
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 3490
   $$lcssa291 = $52; //@line 3490
   $$lcssa292 = $51; //@line 3490
  } else {
   $$0262309 = 0; //@line 3492
   $60 = $52; //@line 3492
   $65 = $51; //@line 3492
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 3497
    $64 = $65 + 1 | 0; //@line 3498
    HEAP32[$5 >> 2] = $64; //@line 3499
    $66 = HEAP8[$64 >> 0] | 0; //@line 3500
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 3502
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 3509
     $$lcssa291 = $66; //@line 3509
     $$lcssa292 = $64; //@line 3509
     break;
    } else {
     $$0262309 = $63; //@line 3512
     $60 = $66; //@line 3512
     $65 = $64; //@line 3512
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 3524
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 3526
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 3531
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 3536
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 3548
     $$2271 = 1; //@line 3548
     $storemerge274 = $79 + 3 | 0; //@line 3548
    } else {
     label = 23; //@line 3550
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 3554
    if ($$1270 | 0) {
     $$0 = -1; //@line 3557
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 3572
     $106 = HEAP32[$105 >> 2] | 0; //@line 3573
     HEAP32[$2 >> 2] = $105 + 4; //@line 3575
     $363 = $106; //@line 3576
    } else {
     $363 = 0; //@line 3578
    }
    $$0259 = $363; //@line 3582
    $$2271 = 0; //@line 3582
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 3582
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 3584
   $109 = ($$0259 | 0) < 0; //@line 3585
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 3590
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 3590
   $$3272 = $$2271; //@line 3590
   $115 = $storemerge274; //@line 3590
  } else {
   $112 = _getint_671($5) | 0; //@line 3592
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 3595
    break;
   }
   $$1260 = $112; //@line 3599
   $$1263 = $$0262$lcssa; //@line 3599
   $$3272 = $$1270; //@line 3599
   $115 = HEAP32[$5 >> 2] | 0; //@line 3599
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 3610
     $156 = _getint_671($5) | 0; //@line 3611
     $$0254 = $156; //@line 3613
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 3613
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 3622
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 3627
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 3632
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 3639
      $144 = $125 + 4 | 0; //@line 3643
      HEAP32[$5 >> 2] = $144; //@line 3644
      $$0254 = $140; //@line 3645
      $$pre345 = $144; //@line 3645
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 3651
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 3666
     $152 = HEAP32[$151 >> 2] | 0; //@line 3667
     HEAP32[$2 >> 2] = $151 + 4; //@line 3669
     $364 = $152; //@line 3670
    } else {
     $364 = 0; //@line 3672
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 3675
    HEAP32[$5 >> 2] = $154; //@line 3676
    $$0254 = $364; //@line 3677
    $$pre345 = $154; //@line 3677
   } else {
    $$0254 = -1; //@line 3679
    $$pre345 = $115; //@line 3679
   }
  } while (0);
  $$0252 = 0; //@line 3682
  $158 = $$pre345; //@line 3682
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 3689
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 3692
   HEAP32[$5 >> 2] = $158; //@line 3693
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2929 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 3698
   $168 = $167 & 255; //@line 3699
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 3703
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 3710
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 3714
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 3718
     break L1;
    } else {
     label = 50; //@line 3721
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 3726
     $176 = $3 + ($$0253 << 3) | 0; //@line 3728
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 3733
     $182 = $6; //@line 3734
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 3736
     HEAP32[$182 + 4 >> 2] = $181; //@line 3739
     label = 50; //@line 3740
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 3744
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 3747
    $187 = HEAP32[$5 >> 2] | 0; //@line 3749
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 3753
   if ($10) {
    $187 = $158; //@line 3755
   } else {
    $$0243 = 0; //@line 3757
    $$0247 = $$1248; //@line 3757
    $$0269 = $$3272; //@line 3757
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 3763
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 3769
  $196 = $$1263 & -65537; //@line 3772
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 3773
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3781
       $$0243 = 0; //@line 3782
       $$0247 = $$1248; //@line 3782
       $$0269 = $$3272; //@line 3782
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3788
       $$0243 = 0; //@line 3789
       $$0247 = $$1248; //@line 3789
       $$0269 = $$3272; //@line 3789
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 3797
       HEAP32[$208 >> 2] = $$1248; //@line 3799
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 3802
       $$0243 = 0; //@line 3803
       $$0247 = $$1248; //@line 3803
       $$0269 = $$3272; //@line 3803
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 3810
       $$0243 = 0; //@line 3811
       $$0247 = $$1248; //@line 3811
       $$0269 = $$3272; //@line 3811
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 3818
       $$0243 = 0; //@line 3819
       $$0247 = $$1248; //@line 3819
       $$0269 = $$3272; //@line 3819
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3825
       $$0243 = 0; //@line 3826
       $$0247 = $$1248; //@line 3826
       $$0269 = $$3272; //@line 3826
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 3834
       HEAP32[$220 >> 2] = $$1248; //@line 3836
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 3839
       $$0243 = 0; //@line 3840
       $$0247 = $$1248; //@line 3840
       $$0269 = $$3272; //@line 3840
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 3845
       $$0247 = $$1248; //@line 3845
       $$0269 = $$3272; //@line 3845
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 3855
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 3855
     $$3265 = $$1263$ | 8; //@line 3855
     label = 62; //@line 3856
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 3860
     $$1255 = $$0254; //@line 3860
     $$3265 = $$1263$; //@line 3860
     label = 62; //@line 3861
     break;
    }
   case 111:
    {
     $242 = $6; //@line 3865
     $244 = HEAP32[$242 >> 2] | 0; //@line 3867
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 3870
     $248 = _fmt_o($244, $247, $11) | 0; //@line 3871
     $252 = $12 - $248 | 0; //@line 3875
     $$0228 = $248; //@line 3880
     $$1233 = 0; //@line 3880
     $$1238 = 3393; //@line 3880
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 3880
     $$4266 = $$1263$; //@line 3880
     $281 = $244; //@line 3880
     $283 = $247; //@line 3880
     label = 68; //@line 3881
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 3885
     $258 = HEAP32[$256 >> 2] | 0; //@line 3887
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 3890
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 3893
      $264 = tempRet0; //@line 3894
      $265 = $6; //@line 3895
      HEAP32[$265 >> 2] = $263; //@line 3897
      HEAP32[$265 + 4 >> 2] = $264; //@line 3900
      $$0232 = 1; //@line 3901
      $$0237 = 3393; //@line 3901
      $275 = $263; //@line 3901
      $276 = $264; //@line 3901
      label = 67; //@line 3902
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 3914
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3393 : 3395 : 3394; //@line 3914
      $275 = $258; //@line 3914
      $276 = $261; //@line 3914
      label = 67; //@line 3915
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 3921
     $$0232 = 0; //@line 3927
     $$0237 = 3393; //@line 3927
     $275 = HEAP32[$197 >> 2] | 0; //@line 3927
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 3927
     label = 67; //@line 3928
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 3939
     $$2 = $13; //@line 3940
     $$2234 = 0; //@line 3940
     $$2239 = 3393; //@line 3940
     $$2251 = $11; //@line 3940
     $$5 = 1; //@line 3940
     $$6268 = $196; //@line 3940
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 3947
     label = 72; //@line 3948
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 3952
     $$1 = $302 | 0 ? $302 : 3403; //@line 3955
     label = 72; //@line 3956
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 3966
     HEAP32[$14 >> 2] = 0; //@line 3967
     HEAP32[$6 >> 2] = $8; //@line 3968
     $$4258354 = -1; //@line 3969
     $365 = $8; //@line 3969
     label = 76; //@line 3970
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 3974
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 3977
      $$0240$lcssa356 = 0; //@line 3978
      label = 85; //@line 3979
     } else {
      $$4258354 = $$0254; //@line 3981
      $365 = $$pre348; //@line 3981
      label = 76; //@line 3982
     }
     break;
    }
   case 65:
   case 71:
   case 70:
   case 69:
   case 97:
   case 103:
   case 102:
   case 101:
    {
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 3989
     $$0247 = $$1248; //@line 3989
     $$0269 = $$3272; //@line 3989
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 3994
     $$2234 = 0; //@line 3994
     $$2239 = 3393; //@line 3994
     $$2251 = $11; //@line 3994
     $$5 = $$0254; //@line 3994
     $$6268 = $$1263$; //@line 3994
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 4000
    $227 = $6; //@line 4001
    $229 = HEAP32[$227 >> 2] | 0; //@line 4003
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 4006
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 4008
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 4014
    $$0228 = $234; //@line 4019
    $$1233 = $or$cond278 ? 0 : 2; //@line 4019
    $$1238 = $or$cond278 ? 3393 : 3393 + ($$1236 >> 4) | 0; //@line 4019
    $$2256 = $$1255; //@line 4019
    $$4266 = $$3265; //@line 4019
    $281 = $229; //@line 4019
    $283 = $232; //@line 4019
    label = 68; //@line 4020
   } else if ((label | 0) == 67) {
    label = 0; //@line 4023
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 4025
    $$1233 = $$0232; //@line 4025
    $$1238 = $$0237; //@line 4025
    $$2256 = $$0254; //@line 4025
    $$4266 = $$1263$; //@line 4025
    $281 = $275; //@line 4025
    $283 = $276; //@line 4025
    label = 68; //@line 4026
   } else if ((label | 0) == 72) {
    label = 0; //@line 4029
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 4030
    $306 = ($305 | 0) == 0; //@line 4031
    $$2 = $$1; //@line 4038
    $$2234 = 0; //@line 4038
    $$2239 = 3393; //@line 4038
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 4038
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 4038
    $$6268 = $196; //@line 4038
   } else if ((label | 0) == 76) {
    label = 0; //@line 4041
    $$0229316 = $365; //@line 4042
    $$0240315 = 0; //@line 4042
    $$1244314 = 0; //@line 4042
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 4044
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 4047
      $$2245 = $$1244314; //@line 4047
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 4050
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 4056
      $$2245 = $320; //@line 4056
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 4060
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 4063
      $$0240315 = $325; //@line 4063
      $$1244314 = $320; //@line 4063
     } else {
      $$0240$lcssa = $325; //@line 4065
      $$2245 = $320; //@line 4065
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 4071
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 4074
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 4077
     label = 85; //@line 4078
    } else {
     $$1230327 = $365; //@line 4080
     $$1241326 = 0; //@line 4080
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 4082
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4085
       label = 85; //@line 4086
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 4089
      $$1241326 = $331 + $$1241326 | 0; //@line 4090
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4093
       label = 85; //@line 4094
       break L97;
      }
      _out_670($0, $9, $331); //@line 4098
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4103
       label = 85; //@line 4104
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 4101
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 4112
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 4118
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 4120
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 4125
   $$2 = $or$cond ? $$0228 : $11; //@line 4130
   $$2234 = $$1233; //@line 4130
   $$2239 = $$1238; //@line 4130
   $$2251 = $11; //@line 4130
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 4130
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 4130
  } else if ((label | 0) == 85) {
   label = 0; //@line 4133
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 4135
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 4138
   $$0247 = $$1248; //@line 4138
   $$0269 = $$3272; //@line 4138
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 4143
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 4145
  $345 = $$$5 + $$2234 | 0; //@line 4146
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 4148
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 4149
  _out_670($0, $$2239, $$2234); //@line 4150
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 4152
  _pad_676($0, 48, $$$5, $343, 0); //@line 4153
  _out_670($0, $$2, $343); //@line 4154
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 4156
  $$0243 = $$2261; //@line 4157
  $$0247 = $$1248; //@line 4157
  $$0269 = $$3272; //@line 4157
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 4165
    } else {
     $$2242302 = 1; //@line 4167
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 4170
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 4173
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 4177
      $356 = $$2242302 + 1 | 0; //@line 4178
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 4181
      } else {
       $$2242$lcssa = $356; //@line 4183
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 4189
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 4195
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 4201
       } else {
        $$0 = 1; //@line 4203
        break;
       }
      }
     } else {
      $$0 = 1; //@line 4208
     }
    }
   } else {
    $$0 = $$1248; //@line 4212
   }
  }
 } while (0);
 STACKTOP = sp; //@line 4216
 return $$0 | 0; //@line 4216
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 7794
 $3 = HEAP32[1491] | 0; //@line 7795
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 7798
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 7802
 $7 = $6 & 3; //@line 7803
 if (($7 | 0) == 1) {
  _abort(); //@line 7806
 }
 $9 = $6 & -8; //@line 7809
 $10 = $2 + $9 | 0; //@line 7810
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 7815
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 7821
   $17 = $13 + $9 | 0; //@line 7822
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 7825
   }
   if ((HEAP32[1492] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 7831
    $106 = HEAP32[$105 >> 2] | 0; //@line 7832
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 7836
     $$1382 = $17; //@line 7836
     $114 = $16; //@line 7836
     break;
    }
    HEAP32[1489] = $17; //@line 7839
    HEAP32[$105 >> 2] = $106 & -2; //@line 7841
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 7844
    HEAP32[$16 + $17 >> 2] = $17; //@line 7846
    return;
   }
   $21 = $13 >>> 3; //@line 7849
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 7853
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 7855
    $28 = 5988 + ($21 << 1 << 2) | 0; //@line 7857
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 7862
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7869
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1487] = HEAP32[1487] & ~(1 << $21); //@line 7879
     $$1 = $16; //@line 7880
     $$1382 = $17; //@line 7880
     $114 = $16; //@line 7880
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 7886
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 7890
     }
     $41 = $26 + 8 | 0; //@line 7893
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 7897
     } else {
      _abort(); //@line 7899
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 7904
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 7905
    $$1 = $16; //@line 7906
    $$1382 = $17; //@line 7906
    $114 = $16; //@line 7906
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 7910
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 7912
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 7916
     $60 = $59 + 4 | 0; //@line 7917
     $61 = HEAP32[$60 >> 2] | 0; //@line 7918
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 7921
      if (!$63) {
       $$3 = 0; //@line 7924
       break;
      } else {
       $$1387 = $63; //@line 7927
       $$1390 = $59; //@line 7927
      }
     } else {
      $$1387 = $61; //@line 7930
      $$1390 = $60; //@line 7930
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 7933
      $66 = HEAP32[$65 >> 2] | 0; //@line 7934
      if ($66 | 0) {
       $$1387 = $66; //@line 7937
       $$1390 = $65; //@line 7937
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 7940
      $69 = HEAP32[$68 >> 2] | 0; //@line 7941
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 7946
       $$1390 = $68; //@line 7946
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 7951
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 7954
      $$3 = $$1387; //@line 7955
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 7960
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 7963
     }
     $53 = $51 + 12 | 0; //@line 7966
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7970
     }
     $56 = $48 + 8 | 0; //@line 7973
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 7977
      HEAP32[$56 >> 2] = $51; //@line 7978
      $$3 = $48; //@line 7979
      break;
     } else {
      _abort(); //@line 7982
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 7989
    $$1382 = $17; //@line 7989
    $114 = $16; //@line 7989
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 7992
    $75 = 6252 + ($74 << 2) | 0; //@line 7993
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 7998
      if (!$$3) {
       HEAP32[1488] = HEAP32[1488] & ~(1 << $74); //@line 8005
       $$1 = $16; //@line 8006
       $$1382 = $17; //@line 8006
       $114 = $16; //@line 8006
       break L10;
      }
     } else {
      if ((HEAP32[1491] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 8013
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 8021
       if (!$$3) {
        $$1 = $16; //@line 8024
        $$1382 = $17; //@line 8024
        $114 = $16; //@line 8024
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1491] | 0; //@line 8032
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 8035
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 8039
    $92 = $16 + 16 | 0; //@line 8040
    $93 = HEAP32[$92 >> 2] | 0; //@line 8041
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 8047
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 8051
       HEAP32[$93 + 24 >> 2] = $$3; //@line 8053
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 8059
    if (!$99) {
     $$1 = $16; //@line 8062
     $$1382 = $17; //@line 8062
     $114 = $16; //@line 8062
    } else {
     if ((HEAP32[1491] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 8067
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 8071
      HEAP32[$99 + 24 >> 2] = $$3; //@line 8073
      $$1 = $16; //@line 8074
      $$1382 = $17; //@line 8074
      $114 = $16; //@line 8074
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 8080
   $$1382 = $9; //@line 8080
   $114 = $2; //@line 8080
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 8085
 }
 $115 = $10 + 4 | 0; //@line 8088
 $116 = HEAP32[$115 >> 2] | 0; //@line 8089
 if (!($116 & 1)) {
  _abort(); //@line 8093
 }
 if (!($116 & 2)) {
  if ((HEAP32[1493] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1490] | 0) + $$1382 | 0; //@line 8103
   HEAP32[1490] = $124; //@line 8104
   HEAP32[1493] = $$1; //@line 8105
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 8108
   if (($$1 | 0) != (HEAP32[1492] | 0)) {
    return;
   }
   HEAP32[1492] = 0; //@line 8114
   HEAP32[1489] = 0; //@line 8115
   return;
  }
  if ((HEAP32[1492] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1489] | 0) + $$1382 | 0; //@line 8122
   HEAP32[1489] = $132; //@line 8123
   HEAP32[1492] = $114; //@line 8124
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 8127
   HEAP32[$114 + $132 >> 2] = $132; //@line 8129
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 8133
  $138 = $116 >>> 3; //@line 8134
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 8139
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 8141
    $145 = 5988 + ($138 << 1 << 2) | 0; //@line 8143
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1491] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 8149
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 8156
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1487] = HEAP32[1487] & ~(1 << $138); //@line 8166
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 8172
    } else {
     if ((HEAP32[1491] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 8177
     }
     $160 = $143 + 8 | 0; //@line 8180
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 8184
     } else {
      _abort(); //@line 8186
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 8191
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 8192
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 8195
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 8197
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 8201
      $180 = $179 + 4 | 0; //@line 8202
      $181 = HEAP32[$180 >> 2] | 0; //@line 8203
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 8206
       if (!$183) {
        $$3400 = 0; //@line 8209
        break;
       } else {
        $$1398 = $183; //@line 8212
        $$1402 = $179; //@line 8212
       }
      } else {
       $$1398 = $181; //@line 8215
       $$1402 = $180; //@line 8215
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 8218
       $186 = HEAP32[$185 >> 2] | 0; //@line 8219
       if ($186 | 0) {
        $$1398 = $186; //@line 8222
        $$1402 = $185; //@line 8222
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 8225
       $189 = HEAP32[$188 >> 2] | 0; //@line 8226
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 8231
        $$1402 = $188; //@line 8231
       }
      }
      if ((HEAP32[1491] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 8237
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 8240
       $$3400 = $$1398; //@line 8241
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 8246
      if ((HEAP32[1491] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 8250
      }
      $173 = $170 + 12 | 0; //@line 8253
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 8257
      }
      $176 = $167 + 8 | 0; //@line 8260
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 8264
       HEAP32[$176 >> 2] = $170; //@line 8265
       $$3400 = $167; //@line 8266
       break;
      } else {
       _abort(); //@line 8269
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 8277
     $196 = 6252 + ($195 << 2) | 0; //@line 8278
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 8283
       if (!$$3400) {
        HEAP32[1488] = HEAP32[1488] & ~(1 << $195); //@line 8290
        break L108;
       }
      } else {
       if ((HEAP32[1491] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 8297
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 8305
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1491] | 0; //@line 8315
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 8318
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 8322
     $213 = $10 + 16 | 0; //@line 8323
     $214 = HEAP32[$213 >> 2] | 0; //@line 8324
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 8330
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 8334
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 8336
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 8342
     if ($220 | 0) {
      if ((HEAP32[1491] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 8348
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 8352
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 8354
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 8363
  HEAP32[$114 + $137 >> 2] = $137; //@line 8365
  if (($$1 | 0) == (HEAP32[1492] | 0)) {
   HEAP32[1489] = $137; //@line 8369
   return;
  } else {
   $$2 = $137; //@line 8372
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 8376
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 8379
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 8381
  $$2 = $$1382; //@line 8382
 }
 $235 = $$2 >>> 3; //@line 8384
 if ($$2 >>> 0 < 256) {
  $238 = 5988 + ($235 << 1 << 2) | 0; //@line 8388
  $239 = HEAP32[1487] | 0; //@line 8389
  $240 = 1 << $235; //@line 8390
  if (!($239 & $240)) {
   HEAP32[1487] = $239 | $240; //@line 8395
   $$0403 = $238; //@line 8397
   $$pre$phiZ2D = $238 + 8 | 0; //@line 8397
  } else {
   $244 = $238 + 8 | 0; //@line 8399
   $245 = HEAP32[$244 >> 2] | 0; //@line 8400
   if ((HEAP32[1491] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 8404
   } else {
    $$0403 = $245; //@line 8407
    $$pre$phiZ2D = $244; //@line 8407
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 8410
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 8412
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 8414
  HEAP32[$$1 + 12 >> 2] = $238; //@line 8416
  return;
 }
 $251 = $$2 >>> 8; //@line 8419
 if (!$251) {
  $$0396 = 0; //@line 8422
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 8426
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 8430
   $257 = $251 << $256; //@line 8431
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 8434
   $262 = $257 << $260; //@line 8436
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 8439
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 8444
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 8450
  }
 }
 $276 = 6252 + ($$0396 << 2) | 0; //@line 8453
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 8455
 HEAP32[$$1 + 20 >> 2] = 0; //@line 8458
 HEAP32[$$1 + 16 >> 2] = 0; //@line 8459
 $280 = HEAP32[1488] | 0; //@line 8460
 $281 = 1 << $$0396; //@line 8461
 do {
  if (!($280 & $281)) {
   HEAP32[1488] = $280 | $281; //@line 8467
   HEAP32[$276 >> 2] = $$1; //@line 8468
   HEAP32[$$1 + 24 >> 2] = $276; //@line 8470
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 8472
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 8474
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 8482
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 8482
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 8489
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 8493
    $301 = HEAP32[$299 >> 2] | 0; //@line 8495
    if (!$301) {
     label = 121; //@line 8498
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 8501
     $$0384 = $301; //@line 8501
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1491] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 8508
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 8511
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 8513
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 8515
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 8517
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 8522
    $309 = HEAP32[$308 >> 2] | 0; //@line 8523
    $310 = HEAP32[1491] | 0; //@line 8524
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 8530
     HEAP32[$308 >> 2] = $$1; //@line 8531
     HEAP32[$$1 + 8 >> 2] = $309; //@line 8533
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 8535
     HEAP32[$$1 + 24 >> 2] = 0; //@line 8537
     break;
    } else {
     _abort(); //@line 8540
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1495] | 0) + -1 | 0; //@line 8547
 HEAP32[1495] = $319; //@line 8548
 if (!$319) {
  $$0212$in$i = 6404; //@line 8551
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 8556
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 8562
  }
 }
 HEAP32[1495] = -1; //@line 8565
 return;
}
function _dispose_chunk($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0419 = 0, $$0420 = 0, $$0431 = 0, $$0438 = 0, $$1 = 0, $$1418 = 0, $$1426 = 0, $$1429 = 0, $$1433 = 0, $$1437 = 0, $$2 = 0, $$3 = 0, $$3435 = 0, $$pre$phi23Z2D = 0, $$pre$phi25Z2D = 0, $$pre$phiZ2D = 0, $101 = 0, $102 = 0, $108 = 0, $11 = 0, $110 = 0, $111 = 0, $117 = 0, $12 = 0, $125 = 0, $13 = 0, $130 = 0, $131 = 0, $134 = 0, $136 = 0, $138 = 0, $151 = 0, $156 = 0, $158 = 0, $161 = 0, $163 = 0, $166 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $173 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $184 = 0, $185 = 0, $199 = 0, $2 = 0, $20 = 0, $202 = 0, $203 = 0, $209 = 0, $22 = 0, $224 = 0, $227 = 0, $228 = 0, $229 = 0, $233 = 0, $234 = 0, $24 = 0, $240 = 0, $245 = 0, $246 = 0, $249 = 0, $251 = 0, $254 = 0, $259 = 0, $265 = 0, $269 = 0, $270 = 0, $288 = 0, $290 = 0, $297 = 0, $298 = 0, $299 = 0, $37 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $49 = 0, $52 = 0, $55 = 0, $56 = 0, $57 = 0, $59 = 0, $61 = 0, $62 = 0, $64 = 0, $65 = 0, $7 = 0, $70 = 0, $71 = 0, $85 = 0, $88 = 0, $89 = 0, $95 = 0, label = 0;
 $2 = $0 + $1 | 0; //@line 9061
 $4 = HEAP32[$0 + 4 >> 2] | 0; //@line 9063
 L1 : do {
  if (!($4 & 1)) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9068
   if (!($4 & 3)) {
    return;
   }
   $11 = $0 + (0 - $7) | 0; //@line 9075
   $12 = $7 + $1 | 0; //@line 9076
   $13 = HEAP32[1491] | 0; //@line 9077
   if ($11 >>> 0 < $13 >>> 0) {
    _abort(); //@line 9080
   }
   if ((HEAP32[1492] | 0) == ($11 | 0)) {
    $101 = $2 + 4 | 0; //@line 9086
    $102 = HEAP32[$101 >> 2] | 0; //@line 9087
    if (($102 & 3 | 0) != 3) {
     $$1 = $11; //@line 9091
     $$1418 = $12; //@line 9091
     break;
    }
    HEAP32[1489] = $12; //@line 9094
    HEAP32[$101 >> 2] = $102 & -2; //@line 9096
    HEAP32[$11 + 4 >> 2] = $12 | 1; //@line 9099
    HEAP32[$2 >> 2] = $12; //@line 9100
    return;
   }
   $17 = $7 >>> 3; //@line 9103
   if ($7 >>> 0 < 256) {
    $20 = HEAP32[$11 + 8 >> 2] | 0; //@line 9107
    $22 = HEAP32[$11 + 12 >> 2] | 0; //@line 9109
    $24 = 5988 + ($17 << 1 << 2) | 0; //@line 9111
    if (($20 | 0) != ($24 | 0)) {
     if ($13 >>> 0 > $20 >>> 0) {
      _abort(); //@line 9116
     }
     if ((HEAP32[$20 + 12 >> 2] | 0) != ($11 | 0)) {
      _abort(); //@line 9123
     }
    }
    if (($22 | 0) == ($20 | 0)) {
     HEAP32[1487] = HEAP32[1487] & ~(1 << $17); //@line 9133
     $$1 = $11; //@line 9134
     $$1418 = $12; //@line 9134
     break;
    }
    if (($22 | 0) == ($24 | 0)) {
     $$pre$phi25Z2D = $22 + 8 | 0; //@line 9140
    } else {
     if ($13 >>> 0 > $22 >>> 0) {
      _abort(); //@line 9144
     }
     $37 = $22 + 8 | 0; //@line 9147
     if ((HEAP32[$37 >> 2] | 0) == ($11 | 0)) {
      $$pre$phi25Z2D = $37; //@line 9151
     } else {
      _abort(); //@line 9153
     }
    }
    HEAP32[$20 + 12 >> 2] = $22; //@line 9158
    HEAP32[$$pre$phi25Z2D >> 2] = $20; //@line 9159
    $$1 = $11; //@line 9160
    $$1418 = $12; //@line 9160
    break;
   }
   $42 = HEAP32[$11 + 24 >> 2] | 0; //@line 9164
   $44 = HEAP32[$11 + 12 >> 2] | 0; //@line 9166
   do {
    if (($44 | 0) == ($11 | 0)) {
     $55 = $11 + 16 | 0; //@line 9170
     $56 = $55 + 4 | 0; //@line 9171
     $57 = HEAP32[$56 >> 2] | 0; //@line 9172
     if (!$57) {
      $59 = HEAP32[$55 >> 2] | 0; //@line 9175
      if (!$59) {
       $$3 = 0; //@line 9178
       break;
      } else {
       $$1426 = $59; //@line 9181
       $$1429 = $55; //@line 9181
      }
     } else {
      $$1426 = $57; //@line 9184
      $$1429 = $56; //@line 9184
     }
     while (1) {
      $61 = $$1426 + 20 | 0; //@line 9187
      $62 = HEAP32[$61 >> 2] | 0; //@line 9188
      if ($62 | 0) {
       $$1426 = $62; //@line 9191
       $$1429 = $61; //@line 9191
       continue;
      }
      $64 = $$1426 + 16 | 0; //@line 9194
      $65 = HEAP32[$64 >> 2] | 0; //@line 9195
      if (!$65) {
       break;
      } else {
       $$1426 = $65; //@line 9200
       $$1429 = $64; //@line 9200
      }
     }
     if ($13 >>> 0 > $$1429 >>> 0) {
      _abort(); //@line 9205
     } else {
      HEAP32[$$1429 >> 2] = 0; //@line 9208
      $$3 = $$1426; //@line 9209
      break;
     }
    } else {
     $47 = HEAP32[$11 + 8 >> 2] | 0; //@line 9214
     if ($13 >>> 0 > $47 >>> 0) {
      _abort(); //@line 9217
     }
     $49 = $47 + 12 | 0; //@line 9220
     if ((HEAP32[$49 >> 2] | 0) != ($11 | 0)) {
      _abort(); //@line 9224
     }
     $52 = $44 + 8 | 0; //@line 9227
     if ((HEAP32[$52 >> 2] | 0) == ($11 | 0)) {
      HEAP32[$49 >> 2] = $44; //@line 9231
      HEAP32[$52 >> 2] = $47; //@line 9232
      $$3 = $44; //@line 9233
      break;
     } else {
      _abort(); //@line 9236
     }
    }
   } while (0);
   if (!$42) {
    $$1 = $11; //@line 9243
    $$1418 = $12; //@line 9243
   } else {
    $70 = HEAP32[$11 + 28 >> 2] | 0; //@line 9246
    $71 = 6252 + ($70 << 2) | 0; //@line 9247
    do {
     if ((HEAP32[$71 >> 2] | 0) == ($11 | 0)) {
      HEAP32[$71 >> 2] = $$3; //@line 9252
      if (!$$3) {
       HEAP32[1488] = HEAP32[1488] & ~(1 << $70); //@line 9259
       $$1 = $11; //@line 9260
       $$1418 = $12; //@line 9260
       break L1;
      }
     } else {
      if ((HEAP32[1491] | 0) >>> 0 > $42 >>> 0) {
       _abort(); //@line 9267
      } else {
       HEAP32[$42 + 16 + (((HEAP32[$42 + 16 >> 2] | 0) != ($11 | 0) & 1) << 2) >> 2] = $$3; //@line 9275
       if (!$$3) {
        $$1 = $11; //@line 9278
        $$1418 = $12; //@line 9278
        break L1;
       } else {
        break;
       }
      }
     }
    } while (0);
    $85 = HEAP32[1491] | 0; //@line 9286
    if ($85 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 9289
    }
    HEAP32[$$3 + 24 >> 2] = $42; //@line 9293
    $88 = $11 + 16 | 0; //@line 9294
    $89 = HEAP32[$88 >> 2] | 0; //@line 9295
    do {
     if ($89 | 0) {
      if ($85 >>> 0 > $89 >>> 0) {
       _abort(); //@line 9301
      } else {
       HEAP32[$$3 + 16 >> 2] = $89; //@line 9305
       HEAP32[$89 + 24 >> 2] = $$3; //@line 9307
       break;
      }
     }
    } while (0);
    $95 = HEAP32[$88 + 4 >> 2] | 0; //@line 9313
    if (!$95) {
     $$1 = $11; //@line 9316
     $$1418 = $12; //@line 9316
    } else {
     if ((HEAP32[1491] | 0) >>> 0 > $95 >>> 0) {
      _abort(); //@line 9321
     } else {
      HEAP32[$$3 + 20 >> 2] = $95; //@line 9325
      HEAP32[$95 + 24 >> 2] = $$3; //@line 9327
      $$1 = $11; //@line 9328
      $$1418 = $12; //@line 9328
      break;
     }
    }
   }
  } else {
   $$1 = $0; //@line 9334
   $$1418 = $1; //@line 9334
  }
 } while (0);
 $108 = HEAP32[1491] | 0; //@line 9337
 if ($2 >>> 0 < $108 >>> 0) {
  _abort(); //@line 9340
 }
 $110 = $2 + 4 | 0; //@line 9343
 $111 = HEAP32[$110 >> 2] | 0; //@line 9344
 if (!($111 & 2)) {
  if ((HEAP32[1493] | 0) == ($2 | 0)) {
   $117 = (HEAP32[1490] | 0) + $$1418 | 0; //@line 9352
   HEAP32[1490] = $117; //@line 9353
   HEAP32[1493] = $$1; //@line 9354
   HEAP32[$$1 + 4 >> 2] = $117 | 1; //@line 9357
   if (($$1 | 0) != (HEAP32[1492] | 0)) {
    return;
   }
   HEAP32[1492] = 0; //@line 9363
   HEAP32[1489] = 0; //@line 9364
   return;
  }
  if ((HEAP32[1492] | 0) == ($2 | 0)) {
   $125 = (HEAP32[1489] | 0) + $$1418 | 0; //@line 9371
   HEAP32[1489] = $125; //@line 9372
   HEAP32[1492] = $$1; //@line 9373
   HEAP32[$$1 + 4 >> 2] = $125 | 1; //@line 9376
   HEAP32[$$1 + $125 >> 2] = $125; //@line 9378
   return;
  }
  $130 = ($111 & -8) + $$1418 | 0; //@line 9382
  $131 = $111 >>> 3; //@line 9383
  L96 : do {
   if ($111 >>> 0 < 256) {
    $134 = HEAP32[$2 + 8 >> 2] | 0; //@line 9388
    $136 = HEAP32[$2 + 12 >> 2] | 0; //@line 9390
    $138 = 5988 + ($131 << 1 << 2) | 0; //@line 9392
    if (($134 | 0) != ($138 | 0)) {
     if ($108 >>> 0 > $134 >>> 0) {
      _abort(); //@line 9397
     }
     if ((HEAP32[$134 + 12 >> 2] | 0) != ($2 | 0)) {
      _abort(); //@line 9404
     }
    }
    if (($136 | 0) == ($134 | 0)) {
     HEAP32[1487] = HEAP32[1487] & ~(1 << $131); //@line 9414
     break;
    }
    if (($136 | 0) == ($138 | 0)) {
     $$pre$phi23Z2D = $136 + 8 | 0; //@line 9420
    } else {
     if ($108 >>> 0 > $136 >>> 0) {
      _abort(); //@line 9424
     }
     $151 = $136 + 8 | 0; //@line 9427
     if ((HEAP32[$151 >> 2] | 0) == ($2 | 0)) {
      $$pre$phi23Z2D = $151; //@line 9431
     } else {
      _abort(); //@line 9433
     }
    }
    HEAP32[$134 + 12 >> 2] = $136; //@line 9438
    HEAP32[$$pre$phi23Z2D >> 2] = $134; //@line 9439
   } else {
    $156 = HEAP32[$2 + 24 >> 2] | 0; //@line 9442
    $158 = HEAP32[$2 + 12 >> 2] | 0; //@line 9444
    do {
     if (($158 | 0) == ($2 | 0)) {
      $169 = $2 + 16 | 0; //@line 9448
      $170 = $169 + 4 | 0; //@line 9449
      $171 = HEAP32[$170 >> 2] | 0; //@line 9450
      if (!$171) {
       $173 = HEAP32[$169 >> 2] | 0; //@line 9453
       if (!$173) {
        $$3435 = 0; //@line 9456
        break;
       } else {
        $$1433 = $173; //@line 9459
        $$1437 = $169; //@line 9459
       }
      } else {
       $$1433 = $171; //@line 9462
       $$1437 = $170; //@line 9462
      }
      while (1) {
       $175 = $$1433 + 20 | 0; //@line 9465
       $176 = HEAP32[$175 >> 2] | 0; //@line 9466
       if ($176 | 0) {
        $$1433 = $176; //@line 9469
        $$1437 = $175; //@line 9469
        continue;
       }
       $178 = $$1433 + 16 | 0; //@line 9472
       $179 = HEAP32[$178 >> 2] | 0; //@line 9473
       if (!$179) {
        break;
       } else {
        $$1433 = $179; //@line 9478
        $$1437 = $178; //@line 9478
       }
      }
      if ($108 >>> 0 > $$1437 >>> 0) {
       _abort(); //@line 9483
      } else {
       HEAP32[$$1437 >> 2] = 0; //@line 9486
       $$3435 = $$1433; //@line 9487
       break;
      }
     } else {
      $161 = HEAP32[$2 + 8 >> 2] | 0; //@line 9492
      if ($108 >>> 0 > $161 >>> 0) {
       _abort(); //@line 9495
      }
      $163 = $161 + 12 | 0; //@line 9498
      if ((HEAP32[$163 >> 2] | 0) != ($2 | 0)) {
       _abort(); //@line 9502
      }
      $166 = $158 + 8 | 0; //@line 9505
      if ((HEAP32[$166 >> 2] | 0) == ($2 | 0)) {
       HEAP32[$163 >> 2] = $158; //@line 9509
       HEAP32[$166 >> 2] = $161; //@line 9510
       $$3435 = $158; //@line 9511
       break;
      } else {
       _abort(); //@line 9514
      }
     }
    } while (0);
    if ($156 | 0) {
     $184 = HEAP32[$2 + 28 >> 2] | 0; //@line 9522
     $185 = 6252 + ($184 << 2) | 0; //@line 9523
     do {
      if ((HEAP32[$185 >> 2] | 0) == ($2 | 0)) {
       HEAP32[$185 >> 2] = $$3435; //@line 9528
       if (!$$3435) {
        HEAP32[1488] = HEAP32[1488] & ~(1 << $184); //@line 9535
        break L96;
       }
      } else {
       if ((HEAP32[1491] | 0) >>> 0 > $156 >>> 0) {
        _abort(); //@line 9542
       } else {
        HEAP32[$156 + 16 + (((HEAP32[$156 + 16 >> 2] | 0) != ($2 | 0) & 1) << 2) >> 2] = $$3435; //@line 9550
        if (!$$3435) {
         break L96;
        } else {
         break;
        }
       }
      }
     } while (0);
     $199 = HEAP32[1491] | 0; //@line 9560
     if ($199 >>> 0 > $$3435 >>> 0) {
      _abort(); //@line 9563
     }
     HEAP32[$$3435 + 24 >> 2] = $156; //@line 9567
     $202 = $2 + 16 | 0; //@line 9568
     $203 = HEAP32[$202 >> 2] | 0; //@line 9569
     do {
      if ($203 | 0) {
       if ($199 >>> 0 > $203 >>> 0) {
        _abort(); //@line 9575
       } else {
        HEAP32[$$3435 + 16 >> 2] = $203; //@line 9579
        HEAP32[$203 + 24 >> 2] = $$3435; //@line 9581
        break;
       }
      }
     } while (0);
     $209 = HEAP32[$202 + 4 >> 2] | 0; //@line 9587
     if ($209 | 0) {
      if ((HEAP32[1491] | 0) >>> 0 > $209 >>> 0) {
       _abort(); //@line 9593
      } else {
       HEAP32[$$3435 + 20 >> 2] = $209; //@line 9597
       HEAP32[$209 + 24 >> 2] = $$3435; //@line 9599
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $130 | 1; //@line 9608
  HEAP32[$$1 + $130 >> 2] = $130; //@line 9610
  if (($$1 | 0) == (HEAP32[1492] | 0)) {
   HEAP32[1489] = $130; //@line 9614
   return;
  } else {
   $$2 = $130; //@line 9617
  }
 } else {
  HEAP32[$110 >> 2] = $111 & -2; //@line 9621
  HEAP32[$$1 + 4 >> 2] = $$1418 | 1; //@line 9624
  HEAP32[$$1 + $$1418 >> 2] = $$1418; //@line 9626
  $$2 = $$1418; //@line 9627
 }
 $224 = $$2 >>> 3; //@line 9629
 if ($$2 >>> 0 < 256) {
  $227 = 5988 + ($224 << 1 << 2) | 0; //@line 9633
  $228 = HEAP32[1487] | 0; //@line 9634
  $229 = 1 << $224; //@line 9635
  if (!($228 & $229)) {
   HEAP32[1487] = $228 | $229; //@line 9640
   $$0438 = $227; //@line 9642
   $$pre$phiZ2D = $227 + 8 | 0; //@line 9642
  } else {
   $233 = $227 + 8 | 0; //@line 9644
   $234 = HEAP32[$233 >> 2] | 0; //@line 9645
   if ((HEAP32[1491] | 0) >>> 0 > $234 >>> 0) {
    _abort(); //@line 9649
   } else {
    $$0438 = $234; //@line 9652
    $$pre$phiZ2D = $233; //@line 9652
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 9655
  HEAP32[$$0438 + 12 >> 2] = $$1; //@line 9657
  HEAP32[$$1 + 8 >> 2] = $$0438; //@line 9659
  HEAP32[$$1 + 12 >> 2] = $227; //@line 9661
  return;
 }
 $240 = $$2 >>> 8; //@line 9664
 if (!$240) {
  $$0431 = 0; //@line 9667
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0431 = 31; //@line 9671
  } else {
   $245 = ($240 + 1048320 | 0) >>> 16 & 8; //@line 9675
   $246 = $240 << $245; //@line 9676
   $249 = ($246 + 520192 | 0) >>> 16 & 4; //@line 9679
   $251 = $246 << $249; //@line 9681
   $254 = ($251 + 245760 | 0) >>> 16 & 2; //@line 9684
   $259 = 14 - ($249 | $245 | $254) + ($251 << $254 >>> 15) | 0; //@line 9689
   $$0431 = $$2 >>> ($259 + 7 | 0) & 1 | $259 << 1; //@line 9695
  }
 }
 $265 = 6252 + ($$0431 << 2) | 0; //@line 9698
 HEAP32[$$1 + 28 >> 2] = $$0431; //@line 9700
 HEAP32[$$1 + 20 >> 2] = 0; //@line 9703
 HEAP32[$$1 + 16 >> 2] = 0; //@line 9704
 $269 = HEAP32[1488] | 0; //@line 9705
 $270 = 1 << $$0431; //@line 9706
 if (!($269 & $270)) {
  HEAP32[1488] = $269 | $270; //@line 9711
  HEAP32[$265 >> 2] = $$1; //@line 9712
  HEAP32[$$1 + 24 >> 2] = $265; //@line 9714
  HEAP32[$$1 + 12 >> 2] = $$1; //@line 9716
  HEAP32[$$1 + 8 >> 2] = $$1; //@line 9718
  return;
 }
 $$0419 = $$2 << (($$0431 | 0) == 31 ? 0 : 25 - ($$0431 >>> 1) | 0); //@line 9727
 $$0420 = HEAP32[$265 >> 2] | 0; //@line 9727
 while (1) {
  if ((HEAP32[$$0420 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
   label = 121; //@line 9734
   break;
  }
  $288 = $$0420 + 16 + ($$0419 >>> 31 << 2) | 0; //@line 9738
  $290 = HEAP32[$288 >> 2] | 0; //@line 9740
  if (!$290) {
   label = 118; //@line 9743
   break;
  } else {
   $$0419 = $$0419 << 1; //@line 9746
   $$0420 = $290; //@line 9746
  }
 }
 if ((label | 0) == 118) {
  if ((HEAP32[1491] | 0) >>> 0 > $288 >>> 0) {
   _abort(); //@line 9753
  }
  HEAP32[$288 >> 2] = $$1; //@line 9756
  HEAP32[$$1 + 24 >> 2] = $$0420; //@line 9758
  HEAP32[$$1 + 12 >> 2] = $$1; //@line 9760
  HEAP32[$$1 + 8 >> 2] = $$1; //@line 9762
  return;
 } else if ((label | 0) == 121) {
  $297 = $$0420 + 8 | 0; //@line 9766
  $298 = HEAP32[$297 >> 2] | 0; //@line 9767
  $299 = HEAP32[1491] | 0; //@line 9768
  if (!($299 >>> 0 <= $298 >>> 0 & $299 >>> 0 <= $$0420 >>> 0)) {
   _abort(); //@line 9773
  }
  HEAP32[$298 + 12 >> 2] = $$1; //@line 9777
  HEAP32[$297 >> 2] = $$1; //@line 9778
  HEAP32[$$1 + 8 >> 2] = $298; //@line 9780
  HEAP32[$$1 + 12 >> 2] = $$0420; //@line 9782
  HEAP32[$$1 + 24 >> 2] = 0; //@line 9784
  return;
 }
}
function _main() {
 var $0 = 0, $1 = 0, $2 = 0, $20 = 0, $3 = 0, $51 = 0, $83 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx20 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx31 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx46 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4916
 STACKTOP = STACKTOP + 960 | 0; //@line 4917
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(960); //@line 4917
 $vararg_buffer7 = sp + 72 | 0; //@line 4918
 $vararg_buffer4 = sp + 64 | 0; //@line 4919
 $vararg_buffer1 = sp + 56 | 0; //@line 4920
 $vararg_buffer = sp; //@line 4921
 $0 = sp + 84 | 0; //@line 4922
 $1 = sp + 944 | 0; //@line 4923
 $2 = sp + 80 | 0; //@line 4924
 $3 = sp + 76 | 0; //@line 4925
 $AsyncCtx12 = _emscripten_alloc_async_context(56, sp) | 0; //@line 4926
 _puts(2506) | 0; //@line 4927
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 116; //@line 4930
  HEAP32[$AsyncCtx12 + 4 >> 2] = $vararg_buffer; //@line 4932
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 4934
  HEAP32[$AsyncCtx12 + 12 >> 2] = $vararg_buffer1; //@line 4936
  HEAP32[$AsyncCtx12 + 16 >> 2] = $vararg_buffer1; //@line 4938
  HEAP32[$AsyncCtx12 + 20 >> 2] = $vararg_buffer; //@line 4940
  HEAP32[$AsyncCtx12 + 24 >> 2] = $vararg_buffer; //@line 4942
  HEAP32[$AsyncCtx12 + 28 >> 2] = $1; //@line 4944
  HEAP32[$AsyncCtx12 + 32 >> 2] = $2; //@line 4946
  HEAP32[$AsyncCtx12 + 36 >> 2] = $3; //@line 4948
  HEAP32[$AsyncCtx12 + 40 >> 2] = $vararg_buffer4; //@line 4950
  HEAP32[$AsyncCtx12 + 44 >> 2] = $vararg_buffer4; //@line 4952
  HEAP32[$AsyncCtx12 + 48 >> 2] = $vararg_buffer7; //@line 4954
  HEAP32[$AsyncCtx12 + 52 >> 2] = $vararg_buffer7; //@line 4956
  sp = STACKTOP; //@line 4957
  STACKTOP = sp; //@line 4958
  return 0; //@line 4958
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 4960
 __ZN17EthernetInterfaceC2Ev($0); //@line 4961
 if (__ZN17EthernetInterface7connectEv($0) | 0) {
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4965
  _puts(2528) | 0; //@line 4966
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 117; //@line 4969
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4971
   sp = STACKTOP; //@line 4972
   STACKTOP = sp; //@line 4973
   return 0; //@line 4973
  } else {
   _emscripten_free_async_context($AsyncCtx | 0); //@line 4975
   STACKTOP = sp; //@line 4976
   return -1;
  }
 }
 $AsyncCtx46 = _emscripten_alloc_async_context(56, sp) | 0; //@line 4979
 $20 = __ZN17EthernetInterface14get_ip_addressEv($0) | 0; //@line 4980
 if (___async) {
  HEAP32[$AsyncCtx46 >> 2] = 118; //@line 4983
  HEAP32[$AsyncCtx46 + 4 >> 2] = $vararg_buffer; //@line 4985
  HEAP32[$AsyncCtx46 + 8 >> 2] = $0; //@line 4987
  HEAP32[$AsyncCtx46 + 12 >> 2] = $vararg_buffer1; //@line 4989
  HEAP32[$AsyncCtx46 + 16 >> 2] = $vararg_buffer1; //@line 4991
  HEAP32[$AsyncCtx46 + 20 >> 2] = $vararg_buffer4; //@line 4993
  HEAP32[$AsyncCtx46 + 24 >> 2] = $vararg_buffer4; //@line 4995
  HEAP32[$AsyncCtx46 + 28 >> 2] = $2; //@line 4997
  HEAP32[$AsyncCtx46 + 32 >> 2] = $3; //@line 4999
  HEAP32[$AsyncCtx46 + 36 >> 2] = $vararg_buffer7; //@line 5001
  HEAP32[$AsyncCtx46 + 40 >> 2] = $vararg_buffer7; //@line 5003
  HEAP32[$AsyncCtx46 + 44 >> 2] = $vararg_buffer; //@line 5005
  HEAP32[$AsyncCtx46 + 48 >> 2] = $vararg_buffer; //@line 5007
  HEAP32[$AsyncCtx46 + 52 >> 2] = $1; //@line 5009
  sp = STACKTOP; //@line 5010
  STACKTOP = sp; //@line 5011
  return 0; //@line 5011
 }
 _emscripten_free_async_context($AsyncCtx46 | 0); //@line 5013
 HEAP32[$vararg_buffer >> 2] = $20 | 0 ? $20 : 2545; //@line 5016
 _printf(2551, $vararg_buffer) | 0; //@line 5017
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5019
  __ZN9UDPSocketC2I17EthernetInterfaceEEPT_($vararg_buffer, $0); //@line 5020
  if (___async) {
   label = 11; //@line 5023
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 5026
  HEAP8[$1 >> 0] = HEAP8[2570] | 0; //@line 5027
  HEAP8[$1 + 1 >> 0] = HEAP8[2571] | 0; //@line 5027
  HEAP8[$1 + 2 >> 0] = HEAP8[2572] | 0; //@line 5027
  HEAP8[$1 + 3 >> 0] = HEAP8[2573] | 0; //@line 5027
  HEAP8[$1 + 4 >> 0] = HEAP8[2574] | 0; //@line 5027
  $AsyncCtx23 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5028
  $51 = __ZN9UDPSocket6sendtoEPKctPKvj($vararg_buffer, 2575, 37, $1, 5) | 0; //@line 5029
  if (___async) {
   label = 13; //@line 5032
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 5035
  if (($51 | 0) < 0) {
   HEAP32[$vararg_buffer1 >> 2] = $51; //@line 5038
   _printf(2589, $vararg_buffer1) | 0; //@line 5039
   $AsyncCtx42 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5040
   _wait_ms(1e4); //@line 5041
   if (___async) {
    label = 16; //@line 5044
    break;
   }
   _emscripten_free_async_context($AsyncCtx42 | 0); //@line 5047
  } else {
   $AsyncCtx20 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5049
   $83 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($vararg_buffer, 0, $2, 4) | 0; //@line 5050
   if (___async) {
    label = 19; //@line 5053
    break;
   }
   _emscripten_free_async_context($AsyncCtx20 | 0); //@line 5056
   if (($83 | 0) == 4) {
    HEAP32[$3 >> 2] = (_llvm_bswap_i32(HEAP32[$2 >> 2] | 0) | 0) + 2085978496; //@line 5062
    HEAP32[$vararg_buffer7 >> 2] = _ctime($3 | 0) | 0; //@line 5064
    _printf(2636, $vararg_buffer7) | 0; //@line 5065
    $AsyncCtx31 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5066
    __ZN6Socket5closeEv($vararg_buffer) | 0; //@line 5067
    if (___async) {
     label = 25; //@line 5070
     break;
    }
    _emscripten_free_async_context($AsyncCtx31 | 0); //@line 5073
    $AsyncCtx34 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5074
    _wait_ms(1e4); //@line 5075
    if (___async) {
     label = 27; //@line 5078
     break;
    }
    _emscripten_free_async_context($AsyncCtx34 | 0); //@line 5081
   } else {
    HEAP32[$vararg_buffer4 >> 2] = $83; //@line 5083
    _printf(2614, $vararg_buffer4) | 0; //@line 5084
    $AsyncCtx38 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5085
    _wait_ms(1e4); //@line 5086
    if (___async) {
     label = 22; //@line 5089
     break;
    }
    _emscripten_free_async_context($AsyncCtx38 | 0); //@line 5092
   }
  }
  $AsyncCtx27 = _emscripten_alloc_async_context(64, sp) | 0; //@line 5095
  __ZN9UDPSocketD2Ev($vararg_buffer); //@line 5096
  if (___async) {
   label = 31; //@line 5099
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 5102
 }
 if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 119; //@line 5105
  HEAP32[$AsyncCtx16 + 4 >> 2] = $3; //@line 5107
  HEAP32[$AsyncCtx16 + 8 >> 2] = $2; //@line 5109
  HEAP32[$AsyncCtx16 + 12 >> 2] = $vararg_buffer; //@line 5111
  HEAP32[$AsyncCtx16 + 16 >> 2] = $vararg_buffer; //@line 5113
  HEAP32[$AsyncCtx16 + 20 >> 2] = $0; //@line 5115
  HEAP32[$AsyncCtx16 + 24 >> 2] = $vararg_buffer1; //@line 5117
  HEAP32[$AsyncCtx16 + 28 >> 2] = $vararg_buffer1; //@line 5119
  HEAP32[$AsyncCtx16 + 32 >> 2] = $1; //@line 5121
  HEAP32[$AsyncCtx16 + 36 >> 2] = $vararg_buffer4; //@line 5123
  HEAP32[$AsyncCtx16 + 40 >> 2] = $vararg_buffer4; //@line 5125
  HEAP32[$AsyncCtx16 + 44 >> 2] = $2; //@line 5127
  HEAP32[$AsyncCtx16 + 48 >> 2] = $3; //@line 5129
  HEAP32[$AsyncCtx16 + 52 >> 2] = $vararg_buffer7; //@line 5131
  HEAP32[$AsyncCtx16 + 56 >> 2] = $vararg_buffer7; //@line 5133
  HEAP32[$AsyncCtx16 + 60 >> 2] = $vararg_buffer; //@line 5135
  sp = STACKTOP; //@line 5136
  STACKTOP = sp; //@line 5137
  return 0; //@line 5137
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx23 >> 2] = 120; //@line 5140
  HEAP32[$AsyncCtx23 + 4 >> 2] = $3; //@line 5142
  HEAP32[$AsyncCtx23 + 8 >> 2] = $2; //@line 5144
  HEAP32[$AsyncCtx23 + 12 >> 2] = $vararg_buffer; //@line 5146
  HEAP32[$AsyncCtx23 + 16 >> 2] = $vararg_buffer; //@line 5148
  HEAP32[$AsyncCtx23 + 20 >> 2] = $0; //@line 5150
  HEAP32[$AsyncCtx23 + 24 >> 2] = $vararg_buffer1; //@line 5152
  HEAP32[$AsyncCtx23 + 28 >> 2] = $vararg_buffer1; //@line 5154
  HEAP32[$AsyncCtx23 + 32 >> 2] = $1; //@line 5156
  HEAP32[$AsyncCtx23 + 36 >> 2] = $vararg_buffer4; //@line 5158
  HEAP32[$AsyncCtx23 + 40 >> 2] = $vararg_buffer4; //@line 5160
  HEAP32[$AsyncCtx23 + 44 >> 2] = $2; //@line 5162
  HEAP32[$AsyncCtx23 + 48 >> 2] = $3; //@line 5164
  HEAP32[$AsyncCtx23 + 52 >> 2] = $vararg_buffer7; //@line 5166
  HEAP32[$AsyncCtx23 + 56 >> 2] = $vararg_buffer7; //@line 5168
  HEAP32[$AsyncCtx23 + 60 >> 2] = $vararg_buffer; //@line 5170
  sp = STACKTOP; //@line 5171
  STACKTOP = sp; //@line 5172
  return 0; //@line 5172
 } else if ((label | 0) == 16) {
  HEAP32[$AsyncCtx42 >> 2] = 121; //@line 5175
  HEAP32[$AsyncCtx42 + 4 >> 2] = $3; //@line 5177
  HEAP32[$AsyncCtx42 + 8 >> 2] = $2; //@line 5179
  HEAP32[$AsyncCtx42 + 12 >> 2] = $vararg_buffer; //@line 5181
  HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer; //@line 5183
  HEAP32[$AsyncCtx42 + 20 >> 2] = $0; //@line 5185
  HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer1; //@line 5187
  HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer1; //@line 5189
  HEAP32[$AsyncCtx42 + 32 >> 2] = $1; //@line 5191
  HEAP32[$AsyncCtx42 + 36 >> 2] = $vararg_buffer4; //@line 5193
  HEAP32[$AsyncCtx42 + 40 >> 2] = $vararg_buffer4; //@line 5195
  HEAP32[$AsyncCtx42 + 44 >> 2] = $2; //@line 5197
  HEAP32[$AsyncCtx42 + 48 >> 2] = $3; //@line 5199
  HEAP32[$AsyncCtx42 + 52 >> 2] = $vararg_buffer7; //@line 5201
  HEAP32[$AsyncCtx42 + 56 >> 2] = $vararg_buffer7; //@line 5203
  HEAP32[$AsyncCtx42 + 60 >> 2] = $vararg_buffer; //@line 5205
  sp = STACKTOP; //@line 5206
  STACKTOP = sp; //@line 5207
  return 0; //@line 5207
 } else if ((label | 0) == 19) {
  HEAP32[$AsyncCtx20 >> 2] = 122; //@line 5210
  HEAP32[$AsyncCtx20 + 4 >> 2] = $3; //@line 5212
  HEAP32[$AsyncCtx20 + 8 >> 2] = $2; //@line 5214
  HEAP32[$AsyncCtx20 + 12 >> 2] = $vararg_buffer; //@line 5216
  HEAP32[$AsyncCtx20 + 16 >> 2] = $vararg_buffer; //@line 5218
  HEAP32[$AsyncCtx20 + 20 >> 2] = $0; //@line 5220
  HEAP32[$AsyncCtx20 + 24 >> 2] = $vararg_buffer1; //@line 5222
  HEAP32[$AsyncCtx20 + 28 >> 2] = $vararg_buffer1; //@line 5224
  HEAP32[$AsyncCtx20 + 32 >> 2] = $1; //@line 5226
  HEAP32[$AsyncCtx20 + 36 >> 2] = $vararg_buffer4; //@line 5228
  HEAP32[$AsyncCtx20 + 40 >> 2] = $vararg_buffer4; //@line 5230
  HEAP32[$AsyncCtx20 + 44 >> 2] = $2; //@line 5232
  HEAP32[$AsyncCtx20 + 48 >> 2] = $3; //@line 5234
  HEAP32[$AsyncCtx20 + 52 >> 2] = $vararg_buffer7; //@line 5236
  HEAP32[$AsyncCtx20 + 56 >> 2] = $vararg_buffer7; //@line 5238
  HEAP32[$AsyncCtx20 + 60 >> 2] = $vararg_buffer; //@line 5240
  sp = STACKTOP; //@line 5241
  STACKTOP = sp; //@line 5242
  return 0; //@line 5242
 } else if ((label | 0) == 22) {
  HEAP32[$AsyncCtx38 >> 2] = 123; //@line 5245
  HEAP32[$AsyncCtx38 + 4 >> 2] = $3; //@line 5247
  HEAP32[$AsyncCtx38 + 8 >> 2] = $2; //@line 5249
  HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer; //@line 5251
  HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer; //@line 5253
  HEAP32[$AsyncCtx38 + 20 >> 2] = $0; //@line 5255
  HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer1; //@line 5257
  HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer1; //@line 5259
  HEAP32[$AsyncCtx38 + 32 >> 2] = $1; //@line 5261
  HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer4; //@line 5263
  HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer4; //@line 5265
  HEAP32[$AsyncCtx38 + 44 >> 2] = $2; //@line 5267
  HEAP32[$AsyncCtx38 + 48 >> 2] = $3; //@line 5269
  HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer7; //@line 5271
  HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer7; //@line 5273
  HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer; //@line 5275
  sp = STACKTOP; //@line 5276
  STACKTOP = sp; //@line 5277
  return 0; //@line 5277
 } else if ((label | 0) == 25) {
  HEAP32[$AsyncCtx31 >> 2] = 124; //@line 5280
  HEAP32[$AsyncCtx31 + 4 >> 2] = $3; //@line 5282
  HEAP32[$AsyncCtx31 + 8 >> 2] = $2; //@line 5284
  HEAP32[$AsyncCtx31 + 12 >> 2] = $vararg_buffer; //@line 5286
  HEAP32[$AsyncCtx31 + 16 >> 2] = $vararg_buffer; //@line 5288
  HEAP32[$AsyncCtx31 + 20 >> 2] = $0; //@line 5290
  HEAP32[$AsyncCtx31 + 24 >> 2] = $vararg_buffer1; //@line 5292
  HEAP32[$AsyncCtx31 + 28 >> 2] = $vararg_buffer1; //@line 5294
  HEAP32[$AsyncCtx31 + 32 >> 2] = $1; //@line 5296
  HEAP32[$AsyncCtx31 + 36 >> 2] = $vararg_buffer4; //@line 5298
  HEAP32[$AsyncCtx31 + 40 >> 2] = $vararg_buffer4; //@line 5300
  HEAP32[$AsyncCtx31 + 44 >> 2] = $2; //@line 5302
  HEAP32[$AsyncCtx31 + 48 >> 2] = $3; //@line 5304
  HEAP32[$AsyncCtx31 + 52 >> 2] = $vararg_buffer7; //@line 5306
  HEAP32[$AsyncCtx31 + 56 >> 2] = $vararg_buffer7; //@line 5308
  HEAP32[$AsyncCtx31 + 60 >> 2] = $vararg_buffer; //@line 5310
  sp = STACKTOP; //@line 5311
  STACKTOP = sp; //@line 5312
  return 0; //@line 5312
 } else if ((label | 0) == 27) {
  HEAP32[$AsyncCtx34 >> 2] = 125; //@line 5315
  HEAP32[$AsyncCtx34 + 4 >> 2] = $3; //@line 5317
  HEAP32[$AsyncCtx34 + 8 >> 2] = $2; //@line 5319
  HEAP32[$AsyncCtx34 + 12 >> 2] = $vararg_buffer; //@line 5321
  HEAP32[$AsyncCtx34 + 16 >> 2] = $vararg_buffer; //@line 5323
  HEAP32[$AsyncCtx34 + 20 >> 2] = $0; //@line 5325
  HEAP32[$AsyncCtx34 + 24 >> 2] = $vararg_buffer1; //@line 5327
  HEAP32[$AsyncCtx34 + 28 >> 2] = $vararg_buffer1; //@line 5329
  HEAP32[$AsyncCtx34 + 32 >> 2] = $1; //@line 5331
  HEAP32[$AsyncCtx34 + 36 >> 2] = $vararg_buffer4; //@line 5333
  HEAP32[$AsyncCtx34 + 40 >> 2] = $vararg_buffer4; //@line 5335
  HEAP32[$AsyncCtx34 + 44 >> 2] = $2; //@line 5337
  HEAP32[$AsyncCtx34 + 48 >> 2] = $3; //@line 5339
  HEAP32[$AsyncCtx34 + 52 >> 2] = $vararg_buffer7; //@line 5341
  HEAP32[$AsyncCtx34 + 56 >> 2] = $vararg_buffer7; //@line 5343
  HEAP32[$AsyncCtx34 + 60 >> 2] = $vararg_buffer; //@line 5345
  sp = STACKTOP; //@line 5346
  STACKTOP = sp; //@line 5347
  return 0; //@line 5347
 } else if ((label | 0) == 31) {
  HEAP32[$AsyncCtx27 >> 2] = 126; //@line 5350
  HEAP32[$AsyncCtx27 + 4 >> 2] = $3; //@line 5352
  HEAP32[$AsyncCtx27 + 8 >> 2] = $2; //@line 5354
  HEAP32[$AsyncCtx27 + 12 >> 2] = $vararg_buffer; //@line 5356
  HEAP32[$AsyncCtx27 + 16 >> 2] = $vararg_buffer; //@line 5358
  HEAP32[$AsyncCtx27 + 20 >> 2] = $0; //@line 5360
  HEAP32[$AsyncCtx27 + 24 >> 2] = $vararg_buffer1; //@line 5362
  HEAP32[$AsyncCtx27 + 28 >> 2] = $vararg_buffer1; //@line 5364
  HEAP32[$AsyncCtx27 + 32 >> 2] = $1; //@line 5366
  HEAP32[$AsyncCtx27 + 36 >> 2] = $vararg_buffer4; //@line 5368
  HEAP32[$AsyncCtx27 + 40 >> 2] = $vararg_buffer4; //@line 5370
  HEAP32[$AsyncCtx27 + 44 >> 2] = $2; //@line 5372
  HEAP32[$AsyncCtx27 + 48 >> 2] = $3; //@line 5374
  HEAP32[$AsyncCtx27 + 52 >> 2] = $vararg_buffer7; //@line 5376
  HEAP32[$AsyncCtx27 + 56 >> 2] = $vararg_buffer7; //@line 5378
  HEAP32[$AsyncCtx27 + 60 >> 2] = $vararg_buffer; //@line 5380
  sp = STACKTOP; //@line 5381
  STACKTOP = sp; //@line 5382
  return 0; //@line 5382
 }
 return 0; //@line 5384
}
function ___intscan($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0154222 = 0, $$0157 = 0, $$0159 = 0, $$1155192 = 0, $$1158 = 0, $$1160 = 0, $$1160169 = 0, $$1165 = 0, $$1165167 = 0, $$1165168 = 0, $$166 = 0, $$2156210 = 0, $$2161$be = 0, $$2161$lcssa = 0, $$3162$be = 0, $$3162215 = 0, $$4163$be = 0, $$4163$lcssa = 0, $$5$be = 0, $$6$be = 0, $$6$lcssa = 0, $$7$be = 0, $$7198 = 0, $$8 = 0, $$9$be = 0, $104 = 0, $123 = 0, $124 = 0, $131 = 0, $133 = 0, $134 = 0, $138 = 0, $139 = 0, $147 = 0, $152 = 0, $153 = 0, $155 = 0, $158 = 0, $16 = 0, $160 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $169 = 0, $170 = 0, $171 = 0, $189 = 0, $190 = 0, $198 = 0, $20 = 0, $204 = 0, $206 = 0, $207 = 0, $209 = 0, $21 = 0, $211 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $225 = 0, $226 = 0, $227 = 0, $242 = 0, $263 = 0, $265 = 0, $275 = 0, $28 = 0, $284 = 0, $287 = 0, $289 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $32 = 0, $40 = 0, $42 = 0, $50 = 0, $54 = 0, $6 = 0, $7 = 0, $70 = 0, $74 = 0, $75 = 0, $86 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $93 = 0, $94 = 0, $96 = 0, label = 0;
 L1 : do {
  if ($1 >>> 0 > 36) {
   HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 183
   $289 = 0; //@line 184
   $290 = 0; //@line 184
  } else {
   $6 = $0 + 4 | 0; //@line 186
   $7 = $0 + 100 | 0; //@line 187
   do {
    $9 = HEAP32[$6 >> 2] | 0; //@line 189
    if ($9 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
     HEAP32[$6 >> 2] = $9 + 1; //@line 194
     $16 = HEAPU8[$9 >> 0] | 0; //@line 197
    } else {
     $16 = ___shgetc($0) | 0; //@line 200
    }
   } while ((_isspace($16) | 0) != 0);
   L11 : do {
    switch ($16 | 0) {
    case 43:
    case 45:
     {
      $20 = (($16 | 0) == 45) << 31 >> 31; //@line 212
      $21 = HEAP32[$6 >> 2] | 0; //@line 213
      if ($21 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
       HEAP32[$6 >> 2] = $21 + 1; //@line 218
       $$0157 = $20; //@line 221
       $$0159 = HEAPU8[$21 >> 0] | 0; //@line 221
       break L11;
      } else {
       $$0157 = $20; //@line 225
       $$0159 = ___shgetc($0) | 0; //@line 225
       break L11;
      }
      break;
     }
    default:
     {
      $$0157 = 0; //@line 231
      $$0159 = $16; //@line 231
     }
    }
   } while (0);
   $28 = ($1 | 0) == 0; //@line 235
   do {
    if (($1 | 16 | 0) == 16 & ($$0159 | 0) == 48) {
     $32 = HEAP32[$6 >> 2] | 0; //@line 242
     if ($32 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
      HEAP32[$6 >> 2] = $32 + 1; //@line 247
      $40 = HEAPU8[$32 >> 0] | 0; //@line 250
     } else {
      $40 = ___shgetc($0) | 0; //@line 253
     }
     if (($40 | 32 | 0) != 120) {
      if ($28) {
       $$1160169 = $40; //@line 259
       $$1165167 = 8; //@line 259
       label = 46; //@line 260
       break;
      } else {
       $$1160 = $40; //@line 263
       $$1165 = $1; //@line 263
       label = 32; //@line 264
       break;
      }
     }
     $42 = HEAP32[$6 >> 2] | 0; //@line 268
     if ($42 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
      HEAP32[$6 >> 2] = $42 + 1; //@line 273
      $50 = HEAPU8[$42 >> 0] | 0; //@line 276
     } else {
      $50 = ___shgetc($0) | 0; //@line 279
     }
     if ((HEAPU8[2664 + $50 >> 0] | 0) > 15) {
      $54 = (HEAP32[$7 >> 2] | 0) == 0; //@line 286
      if (!$54) {
       HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 290
      }
      if (!$2) {
       ___shlim($0, 0); //@line 294
       $289 = 0; //@line 295
       $290 = 0; //@line 295
       break L1;
      }
      if ($54) {
       $289 = 0; //@line 299
       $290 = 0; //@line 299
       break L1;
      }
      HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 304
      $289 = 0; //@line 305
      $290 = 0; //@line 305
      break L1;
     } else {
      $$1160169 = $50; //@line 308
      $$1165167 = 16; //@line 308
      label = 46; //@line 309
     }
    } else {
     $$166 = $28 ? 10 : $1; //@line 312
     if ($$166 >>> 0 > (HEAPU8[2664 + $$0159 >> 0] | 0) >>> 0) {
      $$1160 = $$0159; //@line 318
      $$1165 = $$166; //@line 318
      label = 32; //@line 319
     } else {
      if (HEAP32[$7 >> 2] | 0) {
       HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 326
      }
      ___shlim($0, 0); //@line 328
      HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 330
      $289 = 0; //@line 331
      $290 = 0; //@line 331
      break L1;
     }
    }
   } while (0);
   L43 : do {
    if ((label | 0) == 32) {
     if (($$1165 | 0) == 10) {
      $70 = $$1160 + -48 | 0; //@line 340
      if ($70 >>> 0 < 10) {
       $$0154222 = 0; //@line 343
       $74 = $70; //@line 343
       do {
        $$0154222 = ($$0154222 * 10 | 0) + $74 | 0; //@line 346
        $75 = HEAP32[$6 >> 2] | 0; //@line 347
        if ($75 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $75 + 1; //@line 352
         $$2161$be = HEAPU8[$75 >> 0] | 0; //@line 355
        } else {
         $$2161$be = ___shgetc($0) | 0; //@line 358
        }
        $74 = $$2161$be + -48 | 0; //@line 360
       } while ($74 >>> 0 < 10 & $$0154222 >>> 0 < 429496729);
       $$2161$lcssa = $$2161$be; //@line 370
       $291 = $$0154222; //@line 370
       $292 = 0; //@line 370
      } else {
       $$2161$lcssa = $$1160; //@line 372
       $291 = 0; //@line 372
       $292 = 0; //@line 372
      }
      $86 = $$2161$lcssa + -48 | 0; //@line 374
      if ($86 >>> 0 < 10) {
       $$3162215 = $$2161$lcssa; //@line 377
       $88 = $291; //@line 377
       $89 = $292; //@line 377
       $93 = $86; //@line 377
       while (1) {
        $90 = ___muldi3($88 | 0, $89 | 0, 10, 0) | 0; //@line 379
        $91 = tempRet0; //@line 380
        $94 = (($93 | 0) < 0) << 31 >> 31; //@line 382
        $96 = ~$94; //@line 384
        if ($91 >>> 0 > $96 >>> 0 | ($91 | 0) == ($96 | 0) & $90 >>> 0 > ~$93 >>> 0) {
         $$1165168 = 10; //@line 391
         $$8 = $$3162215; //@line 391
         $293 = $88; //@line 391
         $294 = $89; //@line 391
         label = 72; //@line 392
         break L43;
        }
        $88 = _i64Add($90 | 0, $91 | 0, $93 | 0, $94 | 0) | 0; //@line 395
        $89 = tempRet0; //@line 396
        $104 = HEAP32[$6 >> 2] | 0; //@line 397
        if ($104 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $104 + 1; //@line 402
         $$3162$be = HEAPU8[$104 >> 0] | 0; //@line 405
        } else {
         $$3162$be = ___shgetc($0) | 0; //@line 408
        }
        $93 = $$3162$be + -48 | 0; //@line 410
        if (!($93 >>> 0 < 10 & ($89 >>> 0 < 429496729 | ($89 | 0) == 429496729 & $88 >>> 0 < 2576980378))) {
         break;
        } else {
         $$3162215 = $$3162$be; //@line 419
        }
       }
       if ($93 >>> 0 > 9) {
        $$1158 = $$0157; //@line 426
        $263 = $89; //@line 426
        $265 = $88; //@line 426
       } else {
        $$1165168 = 10; //@line 428
        $$8 = $$3162$be; //@line 428
        $293 = $88; //@line 428
        $294 = $89; //@line 428
        label = 72; //@line 429
       }
      } else {
       $$1158 = $$0157; //@line 432
       $263 = $292; //@line 432
       $265 = $291; //@line 432
      }
     } else {
      $$1160169 = $$1160; //@line 435
      $$1165167 = $$1165; //@line 435
      label = 46; //@line 436
     }
    }
   } while (0);
   L63 : do {
    if ((label | 0) == 46) {
     if (!($$1165167 + -1 & $$1165167)) {
      $131 = HEAP8[2920 + (($$1165167 * 23 | 0) >>> 5 & 7) >> 0] | 0; //@line 451
      $133 = HEAP8[2664 + $$1160169 >> 0] | 0; //@line 453
      $134 = $133 & 255; //@line 454
      if ($$1165167 >>> 0 > $134 >>> 0) {
       $$1155192 = 0; //@line 457
       $138 = $134; //@line 457
       do {
        $$1155192 = $138 | $$1155192 << $131; //@line 460
        $139 = HEAP32[$6 >> 2] | 0; //@line 461
        if ($139 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $139 + 1; //@line 466
         $$4163$be = HEAPU8[$139 >> 0] | 0; //@line 469
        } else {
         $$4163$be = ___shgetc($0) | 0; //@line 472
        }
        $147 = HEAP8[2664 + $$4163$be >> 0] | 0; //@line 475
        $138 = $147 & 255; //@line 476
       } while ($$1155192 >>> 0 < 134217728 & $$1165167 >>> 0 > $138 >>> 0);
       $$4163$lcssa = $$4163$be; //@line 486
       $155 = $147; //@line 486
       $158 = 0; //@line 486
       $160 = $$1155192; //@line 486
      } else {
       $$4163$lcssa = $$1160169; //@line 488
       $155 = $133; //@line 488
       $158 = 0; //@line 488
       $160 = 0; //@line 488
      }
      $152 = _bitshift64Lshr(-1, -1, $131 | 0) | 0; //@line 490
      $153 = tempRet0; //@line 491
      if ($$1165167 >>> 0 <= ($155 & 255) >>> 0 | ($153 >>> 0 < $158 >>> 0 | ($153 | 0) == ($158 | 0) & $152 >>> 0 < $160 >>> 0)) {
       $$1165168 = $$1165167; //@line 501
       $$8 = $$4163$lcssa; //@line 501
       $293 = $160; //@line 501
       $294 = $158; //@line 501
       label = 72; //@line 502
       break;
      } else {
       $164 = $160; //@line 505
       $165 = $158; //@line 505
       $169 = $155; //@line 505
      }
      while (1) {
       $166 = _bitshift64Shl($164 | 0, $165 | 0, $131 | 0) | 0; //@line 508
       $167 = tempRet0; //@line 509
       $170 = $166 | $169 & 255; //@line 511
       $171 = HEAP32[$6 >> 2] | 0; //@line 512
       if ($171 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $171 + 1; //@line 517
        $$5$be = HEAPU8[$171 >> 0] | 0; //@line 520
       } else {
        $$5$be = ___shgetc($0) | 0; //@line 523
       }
       $169 = HEAP8[2664 + $$5$be >> 0] | 0; //@line 526
       if ($$1165167 >>> 0 <= ($169 & 255) >>> 0 | ($167 >>> 0 > $153 >>> 0 | ($167 | 0) == ($153 | 0) & $170 >>> 0 > $152 >>> 0)) {
        $$1165168 = $$1165167; //@line 536
        $$8 = $$5$be; //@line 536
        $293 = $170; //@line 536
        $294 = $167; //@line 536
        label = 72; //@line 537
        break L63;
       } else {
        $164 = $170; //@line 540
        $165 = $167; //@line 540
       }
      }
     }
     $123 = HEAP8[2664 + $$1160169 >> 0] | 0; //@line 545
     $124 = $123 & 255; //@line 546
     if ($$1165167 >>> 0 > $124 >>> 0) {
      $$2156210 = 0; //@line 549
      $189 = $124; //@line 549
      do {
       $$2156210 = $189 + (Math_imul($$2156210, $$1165167) | 0) | 0; //@line 552
       $190 = HEAP32[$6 >> 2] | 0; //@line 553
       if ($190 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $190 + 1; //@line 558
        $$6$be = HEAPU8[$190 >> 0] | 0; //@line 561
       } else {
        $$6$be = ___shgetc($0) | 0; //@line 564
       }
       $198 = HEAP8[2664 + $$6$be >> 0] | 0; //@line 567
       $189 = $198 & 255; //@line 568
      } while ($$2156210 >>> 0 < 119304647 & $$1165167 >>> 0 > $189 >>> 0);
      $$6$lcssa = $$6$be; //@line 578
      $204 = $198; //@line 578
      $295 = $$2156210; //@line 578
      $296 = 0; //@line 578
     } else {
      $$6$lcssa = $$1160169; //@line 580
      $204 = $123; //@line 580
      $295 = 0; //@line 580
      $296 = 0; //@line 580
     }
     if ($$1165167 >>> 0 > ($204 & 255) >>> 0) {
      $206 = ___udivdi3(-1, -1, $$1165167 | 0, 0) | 0; //@line 585
      $207 = tempRet0; //@line 586
      $$7198 = $$6$lcssa; //@line 587
      $209 = $296; //@line 587
      $211 = $295; //@line 587
      $218 = $204; //@line 587
      while (1) {
       if ($209 >>> 0 > $207 >>> 0 | ($209 | 0) == ($207 | 0) & $211 >>> 0 > $206 >>> 0) {
        $$1165168 = $$1165167; //@line 595
        $$8 = $$7198; //@line 595
        $293 = $211; //@line 595
        $294 = $209; //@line 595
        label = 72; //@line 596
        break L63;
       }
       $215 = ___muldi3($211 | 0, $209 | 0, $$1165167 | 0, 0) | 0; //@line 599
       $216 = tempRet0; //@line 600
       $217 = $218 & 255; //@line 601
       if ($216 >>> 0 > 4294967295 | ($216 | 0) == -1 & $215 >>> 0 > ~$217 >>> 0) {
        $$1165168 = $$1165167; //@line 609
        $$8 = $$7198; //@line 609
        $293 = $211; //@line 609
        $294 = $209; //@line 609
        label = 72; //@line 610
        break L63;
       }
       $225 = _i64Add($215 | 0, $216 | 0, $217 | 0, 0) | 0; //@line 613
       $226 = tempRet0; //@line 614
       $227 = HEAP32[$6 >> 2] | 0; //@line 615
       if ($227 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $227 + 1; //@line 620
        $$7$be = HEAPU8[$227 >> 0] | 0; //@line 623
       } else {
        $$7$be = ___shgetc($0) | 0; //@line 626
       }
       $218 = HEAP8[2664 + $$7$be >> 0] | 0; //@line 629
       if ($$1165167 >>> 0 <= ($218 & 255) >>> 0) {
        $$1165168 = $$1165167; //@line 635
        $$8 = $$7$be; //@line 635
        $293 = $225; //@line 635
        $294 = $226; //@line 635
        label = 72; //@line 636
        break;
       } else {
        $$7198 = $$7$be; //@line 633
        $209 = $226; //@line 633
        $211 = $225; //@line 633
       }
      }
     } else {
      $$1165168 = $$1165167; //@line 641
      $$8 = $$6$lcssa; //@line 641
      $293 = $295; //@line 641
      $294 = $296; //@line 641
      label = 72; //@line 642
     }
    }
   } while (0);
   if ((label | 0) == 72) {
    if ($$1165168 >>> 0 > (HEAPU8[2664 + $$8 >> 0] | 0) >>> 0) {
     do {
      $242 = HEAP32[$6 >> 2] | 0; //@line 653
      if ($242 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
       HEAP32[$6 >> 2] = $242 + 1; //@line 658
       $$9$be = HEAPU8[$242 >> 0] | 0; //@line 661
      } else {
       $$9$be = ___shgetc($0) | 0; //@line 664
      }
     } while ($$1165168 >>> 0 > (HEAPU8[2664 + $$9$be >> 0] | 0) >>> 0);
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 675
     $$1158 = ($3 & 1 | 0) == 0 & 0 == 0 ? $$0157 : 0; //@line 681
     $263 = $4; //@line 681
     $265 = $3; //@line 681
    } else {
     $$1158 = $$0157; //@line 683
     $263 = $294; //@line 683
     $265 = $293; //@line 683
    }
   }
   if (HEAP32[$7 >> 2] | 0) {
    HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 691
   }
   if (!($263 >>> 0 < $4 >>> 0 | ($263 | 0) == ($4 | 0) & $265 >>> 0 < $3 >>> 0)) {
    if (!(($3 & 1 | 0) != 0 | 0 != 0 | ($$1158 | 0) != 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 707
     $275 = _i64Add($3 | 0, $4 | 0, -1, -1) | 0; //@line 708
     $289 = tempRet0; //@line 710
     $290 = $275; //@line 710
     break;
    }
    if ($263 >>> 0 > $4 >>> 0 | ($263 | 0) == ($4 | 0) & $265 >>> 0 > $3 >>> 0) {
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 720
     $289 = $4; //@line 721
     $290 = $3; //@line 721
     break;
    }
   }
   $284 = (($$1158 | 0) < 0) << 31 >> 31; //@line 726
   $287 = _i64Subtract($265 ^ $$1158 | 0, $263 ^ $284 | 0, $$1158 | 0, $284 | 0) | 0; //@line 729
   $289 = tempRet0; //@line 731
   $290 = $287; //@line 731
  }
 } while (0);
 tempRet0 = $289; //@line 734
 return $290 | 0; //@line 735
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_26($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$1 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $101 = 0, $109 = 0, $12 = 0, $120 = 0, $125 = 0, $126 = 0, $128 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $56 = 0, $6 = 0, $62 = 0, $69 = 0, $70 = 0, $75 = 0, $77 = 0, $78 = 0, $8 = 0, $81 = 0, $85 = 0, $86 = 0, $90 = 0, $93 = 0, $95 = 0, $96 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11684
 STACKTOP = STACKTOP + 32 | 0; //@line 11685
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 11685
 $$byval_copy = sp; //@line 11686
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11688
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11690
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11692
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11694
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11696
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11698
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11700
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11702
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11704
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11706
 $22 = HEAP8[$0 + 44 >> 0] | 0; //@line 11708
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11710
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11712
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11714
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11716
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11718
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11720
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11722
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11724
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11726
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$2 >> 0] = 0; //@line 11729
  HEAP8[$4 >> 0] = 1; //@line 11730
  HEAP8[$6 >> 0] = 1; //@line 11731
  HEAP8[$8 >> 0] = 0; //@line 11732
  HEAP8[$10 >> 0] = 0; //@line 11733
  HEAP8[$12 >> 0] = 1; //@line 11734
  HEAP8[$14 >> 0] = 0; //@line 11735
  HEAP8[$14 + 1 >> 0] = 0; //@line 11735
  HEAP8[$14 + 2 >> 0] = 0; //@line 11735
  HEAP8[$14 + 3 >> 0] = 0; //@line 11735
  HEAP8[$14 + 4 >> 0] = 0; //@line 11735
  HEAP8[$14 + 5 >> 0] = 0; //@line 11735
  if (!(HEAP8[$16 >> 0] | 0)) {
   $223 = $20; //@line 11739
  } else {
   $$019$i$1 = $16; //@line 11741
   $211 = $20; //@line 11741
   while (1) {
    $208 = _strcspn($$019$i$1, 3461) | 0; //@line 11743
    $210 = $211 + 1 | 0; //@line 11745
    HEAP8[$211 >> 0] = $208; //@line 11746
    $212 = $208 & 255; //@line 11747
    _memcpy($210 | 0, $$019$i$1 | 0, $212 | 0) | 0; //@line 11748
    $213 = $210 + $212 | 0; //@line 11749
    $$019$i$1 = $$019$i$1 + ($208 + ((HEAP8[$$019$i$1 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 11755
    if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
     $223 = $213; //@line 11759
     break;
    } else {
     $211 = $213; //@line 11762
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 11767
  HEAP8[$223 + 1 >> 0] = 0; //@line 11769
  HEAP8[$223 + 2 >> 0] = $22; //@line 11771
  HEAP8[$223 + 3 >> 0] = 0; //@line 11773
  HEAP8[$223 + 4 >> 0] = 1; //@line 11774
  HEAP32[$$byval_copy >> 2] = HEAP32[119]; //@line 11775
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[120]; //@line 11775
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[121]; //@line 11775
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[122]; //@line 11775
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[123]; //@line 11775
  __ZN13SocketAddressC2E10nsapi_addrt($26, $$byval_copy, 53); //@line 11776
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(80) | 0; //@line 11780
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($18, $26, $2, $223 + 5 - $28 | 0) | 0; //@line 11781
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 11784
   $231 = $ReallocAsyncCtx9 + 4 | 0; //@line 11785
   HEAP32[$231 >> 2] = $18; //@line 11786
   $232 = $ReallocAsyncCtx9 + 8 | 0; //@line 11787
   HEAP32[$232 >> 2] = $2; //@line 11788
   $233 = $ReallocAsyncCtx9 + 12 | 0; //@line 11789
   HEAP32[$233 >> 2] = $20; //@line 11790
   $234 = $ReallocAsyncCtx9 + 16 | 0; //@line 11791
   HEAP8[$234 >> 0] = $22; //@line 11792
   $235 = $ReallocAsyncCtx9 + 20 | 0; //@line 11793
   HEAP32[$235 >> 2] = $24; //@line 11794
   $236 = $ReallocAsyncCtx9 + 24 | 0; //@line 11795
   HEAP32[$236 >> 2] = $26; //@line 11796
   $237 = $ReallocAsyncCtx9 + 28 | 0; //@line 11797
   HEAP32[$237 >> 2] = $28; //@line 11798
   $238 = $ReallocAsyncCtx9 + 32 | 0; //@line 11799
   HEAP32[$238 >> 2] = $30; //@line 11800
   $239 = $ReallocAsyncCtx9 + 36 | 0; //@line 11801
   HEAP32[$239 >> 2] = $4; //@line 11802
   $240 = $ReallocAsyncCtx9 + 40 | 0; //@line 11803
   HEAP32[$240 >> 2] = $6; //@line 11804
   $241 = $ReallocAsyncCtx9 + 44 | 0; //@line 11805
   HEAP32[$241 >> 2] = $8; //@line 11806
   $242 = $ReallocAsyncCtx9 + 48 | 0; //@line 11807
   HEAP32[$242 >> 2] = $10; //@line 11808
   $243 = $ReallocAsyncCtx9 + 52 | 0; //@line 11809
   HEAP32[$243 >> 2] = $12; //@line 11810
   $244 = $ReallocAsyncCtx9 + 56 | 0; //@line 11811
   HEAP32[$244 >> 2] = $14; //@line 11812
   $245 = $ReallocAsyncCtx9 + 60 | 0; //@line 11813
   HEAP32[$245 >> 2] = $16; //@line 11814
   $246 = $ReallocAsyncCtx9 + 64 | 0; //@line 11815
   HEAP32[$246 >> 2] = $32; //@line 11816
   $247 = $ReallocAsyncCtx9 + 68 | 0; //@line 11817
   HEAP32[$247 >> 2] = $34; //@line 11818
   $248 = $ReallocAsyncCtx9 + 72 | 0; //@line 11819
   HEAP32[$248 >> 2] = $36; //@line 11820
   $249 = $ReallocAsyncCtx9 + 76 | 0; //@line 11821
   HEAP32[$249 >> 2] = $38; //@line 11822
   sp = STACKTOP; //@line 11823
   STACKTOP = sp; //@line 11824
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 11827
  ___async_unwind = 0; //@line 11828
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 11829
  $231 = $ReallocAsyncCtx9 + 4 | 0; //@line 11830
  HEAP32[$231 >> 2] = $18; //@line 11831
  $232 = $ReallocAsyncCtx9 + 8 | 0; //@line 11832
  HEAP32[$232 >> 2] = $2; //@line 11833
  $233 = $ReallocAsyncCtx9 + 12 | 0; //@line 11834
  HEAP32[$233 >> 2] = $20; //@line 11835
  $234 = $ReallocAsyncCtx9 + 16 | 0; //@line 11836
  HEAP8[$234 >> 0] = $22; //@line 11837
  $235 = $ReallocAsyncCtx9 + 20 | 0; //@line 11838
  HEAP32[$235 >> 2] = $24; //@line 11839
  $236 = $ReallocAsyncCtx9 + 24 | 0; //@line 11840
  HEAP32[$236 >> 2] = $26; //@line 11841
  $237 = $ReallocAsyncCtx9 + 28 | 0; //@line 11842
  HEAP32[$237 >> 2] = $28; //@line 11843
  $238 = $ReallocAsyncCtx9 + 32 | 0; //@line 11844
  HEAP32[$238 >> 2] = $30; //@line 11845
  $239 = $ReallocAsyncCtx9 + 36 | 0; //@line 11846
  HEAP32[$239 >> 2] = $4; //@line 11847
  $240 = $ReallocAsyncCtx9 + 40 | 0; //@line 11848
  HEAP32[$240 >> 2] = $6; //@line 11849
  $241 = $ReallocAsyncCtx9 + 44 | 0; //@line 11850
  HEAP32[$241 >> 2] = $8; //@line 11851
  $242 = $ReallocAsyncCtx9 + 48 | 0; //@line 11852
  HEAP32[$242 >> 2] = $10; //@line 11853
  $243 = $ReallocAsyncCtx9 + 52 | 0; //@line 11854
  HEAP32[$243 >> 2] = $12; //@line 11855
  $244 = $ReallocAsyncCtx9 + 56 | 0; //@line 11856
  HEAP32[$244 >> 2] = $14; //@line 11857
  $245 = $ReallocAsyncCtx9 + 60 | 0; //@line 11858
  HEAP32[$245 >> 2] = $16; //@line 11859
  $246 = $ReallocAsyncCtx9 + 64 | 0; //@line 11860
  HEAP32[$246 >> 2] = $32; //@line 11861
  $247 = $ReallocAsyncCtx9 + 68 | 0; //@line 11862
  HEAP32[$247 >> 2] = $34; //@line 11863
  $248 = $ReallocAsyncCtx9 + 72 | 0; //@line 11864
  HEAP32[$248 >> 2] = $36; //@line 11865
  $249 = $ReallocAsyncCtx9 + 76 | 0; //@line 11866
  HEAP32[$249 >> 2] = $38; //@line 11867
  sp = STACKTOP; //@line 11868
  STACKTOP = sp; //@line 11869
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 11873
 } else {
  $56 = HEAPU8[$10 >> 0] << 8 | HEAPU8[$12 >> 0]; //@line 11889
  $62 = HEAPU8[$14 >> 0] << 8 | HEAPU8[$34 >> 0]; //@line 11895
  if (((HEAP8[$6 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$2 >> 0] << 8 | HEAPU8[$4 >> 0] | 0) == 1 : 0) & (HEAP8[$8 >> 0] & 15) == 0) {
   if (!$56) {
    $251 = $20; //@line 11905
   } else {
    $$093119$i = 0; //@line 11907
    $70 = $20; //@line 11907
    while (1) {
     $69 = HEAP8[$70 >> 0] | 0; //@line 11909
     if (!($69 << 24 >> 24)) {
      $$lcssa$i = $70; //@line 11912
     } else {
      $75 = $70; //@line 11914
      $77 = $69; //@line 11914
      while (1) {
       $78 = $75 + 1 + ($77 & 255) | 0; //@line 11918
       $77 = HEAP8[$78 >> 0] | 0; //@line 11919
       if (!($77 << 24 >> 24)) {
        $$lcssa$i = $78; //@line 11922
        break;
       } else {
        $75 = $78; //@line 11925
       }
      }
     }
     $81 = $$lcssa$i + 5 | 0; //@line 11929
     $$093119$i = $$093119$i + 1 | 0; //@line 11930
     if (($$093119$i | 0) >= ($56 | 0)) {
      $251 = $81; //@line 11935
      break;
     } else {
      $70 = $81; //@line 11933
     }
    }
   }
   if (($32 | 0) != 0 & ($62 | 0) != 0) {
    $$090117$i = $38; //@line 11944
    $$094116$i = 0; //@line 11944
    $$095115$i = 0; //@line 11944
    $85 = $251; //@line 11944
    while (1) {
     $86 = HEAP8[$85 >> 0] | 0; //@line 11947
     do {
      if (!($86 << 24 >> 24)) {
       $101 = $85 + 1 | 0; //@line 11951
      } else {
       $90 = $86 & 255; //@line 11954
       $93 = $85; //@line 11954
       while (1) {
        if ($90 & 192 | 0) {
         label = 13; //@line 11959
         break;
        }
        $95 = $93 + 1 + $90 | 0; //@line 11963
        $96 = HEAP8[$95 >> 0] | 0; //@line 11964
        if (!($96 << 24 >> 24)) {
         label = 15; //@line 11968
         break;
        } else {
         $90 = $96 & 255; //@line 11971
         $93 = $95; //@line 11971
        }
       }
       if ((label | 0) == 13) {
        label = 0; //@line 11975
        $101 = $93 + 2 | 0; //@line 11977
        break;
       } else if ((label | 0) == 15) {
        label = 0; //@line 11981
        $101 = $95 + 1 | 0; //@line 11983
        break;
       }
      }
     } while (0);
     $109 = (HEAPU8[$101 >> 0] << 8 | HEAPU8[$101 + 1 >> 0]) & 65535; //@line 11996
     $120 = $101 + 10 | 0; //@line 12007
     $125 = HEAPU8[$101 + 8 >> 0] << 8 | HEAPU8[$101 + 9 >> 0]; //@line 12012
     $126 = $125 & 65535; //@line 12013
     $128 = (HEAPU8[$101 + 2 >> 0] << 8 | HEAPU8[$101 + 3 >> 0] | 0) == 1; //@line 12015
     do {
      if ($109 << 16 >> 16 == 1 & $128 & $126 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 12021
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$120 >> 0] | 0; //@line 12025
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$101 + 11 >> 0] | 0; //@line 12029
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$101 + 12 >> 0] | 0; //@line 12033
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$101 + 13 >> 0] | 0; //@line 12037
       $$0 = $101 + 14 | 0; //@line 12040
       $$1$i = $$090117$i + 20 | 0; //@line 12040
       $$196$i = $$095115$i + 1 | 0; //@line 12040
      } else {
       if ($109 << 16 >> 16 == 28 & $128 & $126 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 12047
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$120 >> 0] | 0; //@line 12051
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$101 + 11 >> 0] | 0; //@line 12055
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$101 + 12 >> 0] | 0; //@line 12059
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$101 + 13 >> 0] | 0; //@line 12063
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$101 + 14 >> 0] | 0; //@line 12067
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$101 + 15 >> 0] | 0; //@line 12071
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$101 + 16 >> 0] | 0; //@line 12075
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$101 + 17 >> 0] | 0; //@line 12079
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$101 + 18 >> 0] | 0; //@line 12083
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$101 + 19 >> 0] | 0; //@line 12087
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$101 + 20 >> 0] | 0; //@line 12091
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$101 + 21 >> 0] | 0; //@line 12095
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$101 + 22 >> 0] | 0; //@line 12099
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$101 + 23 >> 0] | 0; //@line 12103
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$101 + 24 >> 0] | 0; //@line 12107
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$101 + 25 >> 0] | 0; //@line 12111
        $$0 = $101 + 26 | 0; //@line 12114
        $$1$i = $$090117$i + 20 | 0; //@line 12114
        $$196$i = $$095115$i + 1 | 0; //@line 12114
        break;
       } else {
        $$0 = $120 + $125 | 0; //@line 12118
        $$1$i = $$090117$i; //@line 12118
        $$196$i = $$095115$i; //@line 12118
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 12123
     if (!(($$094116$i | 0) < ($62 | 0) & $$196$i >>> 0 < $32 >>> 0)) {
      $$089$i = $$196$i; //@line 12130
      break;
     } else {
      $$090117$i = $$1$i; //@line 12128
      $$095115$i = $$196$i; //@line 12128
      $85 = $$0; //@line 12128
     }
    }
   } else {
    $$089$i = 0; //@line 12135
   }
  } else {
   $$089$i = 0; //@line 12138
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 12142
 }
 _free($2); //@line 12144
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 12145
 $203 = __ZN6Socket5closeEv($30) | 0; //@line 12146
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 12149
  $204 = $ReallocAsyncCtx12 + 4 | 0; //@line 12150
  HEAP32[$204 >> 2] = $$355; //@line 12151
  $205 = $ReallocAsyncCtx12 + 8 | 0; //@line 12152
  HEAP32[$205 >> 2] = $18; //@line 12153
  $206 = $ReallocAsyncCtx12 + 12 | 0; //@line 12154
  HEAP32[$206 >> 2] = $36; //@line 12155
  sp = STACKTOP; //@line 12156
  STACKTOP = sp; //@line 12157
  return;
 }
 HEAP32[___async_retval >> 2] = $203; //@line 12160
 ___async_unwind = 0; //@line 12161
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 12162
 $204 = $ReallocAsyncCtx12 + 4 | 0; //@line 12163
 HEAP32[$204 >> 2] = $$355; //@line 12164
 $205 = $ReallocAsyncCtx12 + 8 | 0; //@line 12165
 HEAP32[$205 >> 2] = $18; //@line 12166
 $206 = $ReallocAsyncCtx12 + 12 | 0; //@line 12167
 HEAP32[$206 >> 2] = $36; //@line 12168
 sp = STACKTOP; //@line 12169
 STACKTOP = sp; //@line 12170
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_25($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$2 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11180
 STACKTOP = STACKTOP + 32 | 0; //@line 11181
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 11181
 $$byval_copy = sp; //@line 11182
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11184
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11186
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11188
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 11190
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11192
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11194
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11196
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11198
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11200
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11202
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11204
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11206
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11208
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11210
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11212
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11214
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11216
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11218
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11220
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11222
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$4 >> 0] = 0; //@line 11225
  HEAP8[$18 >> 0] = 1; //@line 11226
  HEAP8[$20 >> 0] = 1; //@line 11227
  HEAP8[$22 >> 0] = 0; //@line 11228
  HEAP8[$24 >> 0] = 0; //@line 11229
  HEAP8[$26 >> 0] = 1; //@line 11230
  HEAP8[$28 >> 0] = 0; //@line 11231
  HEAP8[$28 + 1 >> 0] = 0; //@line 11231
  HEAP8[$28 + 2 >> 0] = 0; //@line 11231
  HEAP8[$28 + 3 >> 0] = 0; //@line 11231
  HEAP8[$28 + 4 >> 0] = 0; //@line 11231
  HEAP8[$28 + 5 >> 0] = 0; //@line 11231
  if (!(HEAP8[$30 >> 0] | 0)) {
   $223 = $6; //@line 11235
  } else {
   $$019$i$2 = $30; //@line 11237
   $211 = $6; //@line 11237
   while (1) {
    $208 = _strcspn($$019$i$2, 3461) | 0; //@line 11239
    $210 = $211 + 1 | 0; //@line 11241
    HEAP8[$211 >> 0] = $208; //@line 11242
    $212 = $208 & 255; //@line 11243
    _memcpy($210 | 0, $$019$i$2 | 0, $212 | 0) | 0; //@line 11244
    $213 = $210 + $212 | 0; //@line 11245
    $$019$i$2 = $$019$i$2 + ($208 + ((HEAP8[$$019$i$2 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 11251
    if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
     $223 = $213; //@line 11255
     break;
    } else {
     $211 = $213; //@line 11258
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 11263
  HEAP8[$223 + 1 >> 0] = 0; //@line 11265
  HEAP8[$223 + 2 >> 0] = $8; //@line 11267
  HEAP8[$223 + 3 >> 0] = 0; //@line 11269
  HEAP8[$223 + 4 >> 0] = 1; //@line 11270
  HEAP32[$$byval_copy >> 2] = HEAP32[124]; //@line 11271
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[125]; //@line 11271
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[126]; //@line 11271
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[127]; //@line 11271
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[128]; //@line 11271
  __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 11272
  $ReallocAsyncCtx8 = _emscripten_realloc_async_context(80) | 0; //@line 11276
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $223 + 5 - $14 | 0) | 0; //@line 11277
  if (___async) {
   HEAP32[$ReallocAsyncCtx8 >> 2] = 85; //@line 11280
   $231 = $ReallocAsyncCtx8 + 4 | 0; //@line 11281
   HEAP32[$231 >> 2] = $2; //@line 11282
   $232 = $ReallocAsyncCtx8 + 8 | 0; //@line 11283
   HEAP32[$232 >> 2] = $4; //@line 11284
   $233 = $ReallocAsyncCtx8 + 12 | 0; //@line 11285
   HEAP32[$233 >> 2] = $6; //@line 11286
   $234 = $ReallocAsyncCtx8 + 16 | 0; //@line 11287
   HEAP8[$234 >> 0] = $8; //@line 11288
   $235 = $ReallocAsyncCtx8 + 20 | 0; //@line 11289
   HEAP32[$235 >> 2] = $10; //@line 11290
   $236 = $ReallocAsyncCtx8 + 24 | 0; //@line 11291
   HEAP32[$236 >> 2] = $12; //@line 11292
   $237 = $ReallocAsyncCtx8 + 28 | 0; //@line 11293
   HEAP32[$237 >> 2] = $14; //@line 11294
   $238 = $ReallocAsyncCtx8 + 32 | 0; //@line 11295
   HEAP32[$238 >> 2] = $16; //@line 11296
   $239 = $ReallocAsyncCtx8 + 36 | 0; //@line 11297
   HEAP32[$239 >> 2] = $32; //@line 11298
   $240 = $ReallocAsyncCtx8 + 40 | 0; //@line 11299
   HEAP32[$240 >> 2] = $18; //@line 11300
   $241 = $ReallocAsyncCtx8 + 44 | 0; //@line 11301
   HEAP32[$241 >> 2] = $20; //@line 11302
   $242 = $ReallocAsyncCtx8 + 48 | 0; //@line 11303
   HEAP32[$242 >> 2] = $22; //@line 11304
   $243 = $ReallocAsyncCtx8 + 52 | 0; //@line 11305
   HEAP32[$243 >> 2] = $24; //@line 11306
   $244 = $ReallocAsyncCtx8 + 56 | 0; //@line 11307
   HEAP32[$244 >> 2] = $26; //@line 11308
   $245 = $ReallocAsyncCtx8 + 60 | 0; //@line 11309
   HEAP32[$245 >> 2] = $28; //@line 11310
   $246 = $ReallocAsyncCtx8 + 64 | 0; //@line 11311
   HEAP32[$246 >> 2] = $34; //@line 11312
   $247 = $ReallocAsyncCtx8 + 68 | 0; //@line 11313
   HEAP32[$247 >> 2] = $36; //@line 11314
   $248 = $ReallocAsyncCtx8 + 72 | 0; //@line 11315
   HEAP32[$248 >> 2] = $38; //@line 11316
   $249 = $ReallocAsyncCtx8 + 76 | 0; //@line 11317
   HEAP32[$249 >> 2] = $30; //@line 11318
   sp = STACKTOP; //@line 11319
   STACKTOP = sp; //@line 11320
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 11323
  ___async_unwind = 0; //@line 11324
  HEAP32[$ReallocAsyncCtx8 >> 2] = 85; //@line 11325
  $231 = $ReallocAsyncCtx8 + 4 | 0; //@line 11326
  HEAP32[$231 >> 2] = $2; //@line 11327
  $232 = $ReallocAsyncCtx8 + 8 | 0; //@line 11328
  HEAP32[$232 >> 2] = $4; //@line 11329
  $233 = $ReallocAsyncCtx8 + 12 | 0; //@line 11330
  HEAP32[$233 >> 2] = $6; //@line 11331
  $234 = $ReallocAsyncCtx8 + 16 | 0; //@line 11332
  HEAP8[$234 >> 0] = $8; //@line 11333
  $235 = $ReallocAsyncCtx8 + 20 | 0; //@line 11334
  HEAP32[$235 >> 2] = $10; //@line 11335
  $236 = $ReallocAsyncCtx8 + 24 | 0; //@line 11336
  HEAP32[$236 >> 2] = $12; //@line 11337
  $237 = $ReallocAsyncCtx8 + 28 | 0; //@line 11338
  HEAP32[$237 >> 2] = $14; //@line 11339
  $238 = $ReallocAsyncCtx8 + 32 | 0; //@line 11340
  HEAP32[$238 >> 2] = $16; //@line 11341
  $239 = $ReallocAsyncCtx8 + 36 | 0; //@line 11342
  HEAP32[$239 >> 2] = $32; //@line 11343
  $240 = $ReallocAsyncCtx8 + 40 | 0; //@line 11344
  HEAP32[$240 >> 2] = $18; //@line 11345
  $241 = $ReallocAsyncCtx8 + 44 | 0; //@line 11346
  HEAP32[$241 >> 2] = $20; //@line 11347
  $242 = $ReallocAsyncCtx8 + 48 | 0; //@line 11348
  HEAP32[$242 >> 2] = $22; //@line 11349
  $243 = $ReallocAsyncCtx8 + 52 | 0; //@line 11350
  HEAP32[$243 >> 2] = $24; //@line 11351
  $244 = $ReallocAsyncCtx8 + 56 | 0; //@line 11352
  HEAP32[$244 >> 2] = $26; //@line 11353
  $245 = $ReallocAsyncCtx8 + 60 | 0; //@line 11354
  HEAP32[$245 >> 2] = $28; //@line 11355
  $246 = $ReallocAsyncCtx8 + 64 | 0; //@line 11356
  HEAP32[$246 >> 2] = $34; //@line 11357
  $247 = $ReallocAsyncCtx8 + 68 | 0; //@line 11358
  HEAP32[$247 >> 2] = $36; //@line 11359
  $248 = $ReallocAsyncCtx8 + 72 | 0; //@line 11360
  HEAP32[$248 >> 2] = $38; //@line 11361
  $249 = $ReallocAsyncCtx8 + 76 | 0; //@line 11362
  HEAP32[$249 >> 2] = $30; //@line 11363
  sp = STACKTOP; //@line 11364
  STACKTOP = sp; //@line 11365
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 11369
 } else {
  $55 = HEAPU8[$24 >> 0] << 8 | HEAPU8[$26 >> 0]; //@line 11385
  $61 = HEAPU8[$28 >> 0] << 8 | HEAPU8[$34 >> 0]; //@line 11391
  if (((HEAP8[$20 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$4 >> 0] << 8 | HEAPU8[$18 >> 0] | 0) == 1 : 0) & (HEAP8[$22 >> 0] & 15) == 0) {
   if (!$55) {
    $251 = $6; //@line 11401
   } else {
    $$093119$i = 0; //@line 11403
    $69 = $6; //@line 11403
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 11405
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 11408
     } else {
      $74 = $69; //@line 11410
      $76 = $68; //@line 11410
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 11414
       $76 = HEAP8[$77 >> 0] | 0; //@line 11415
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 11418
        break;
       } else {
        $74 = $77; //@line 11421
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 11425
     $$093119$i = $$093119$i + 1 | 0; //@line 11426
     if (($$093119$i | 0) >= ($55 | 0)) {
      $251 = $80; //@line 11431
      break;
     } else {
      $69 = $80; //@line 11429
     }
    }
   }
   if (($32 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $38; //@line 11440
    $$094116$i = 0; //@line 11440
    $$095115$i = 0; //@line 11440
    $84 = $251; //@line 11440
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 11443
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 11447
      } else {
       $89 = $85 & 255; //@line 11450
       $92 = $84; //@line 11450
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 11455
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 11459
        $95 = HEAP8[$94 >> 0] | 0; //@line 11460
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 11464
         break;
        } else {
         $89 = $95 & 255; //@line 11467
         $92 = $94; //@line 11467
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 11471
        $100 = $92 + 2 | 0; //@line 11473
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 11477
        $100 = $94 + 1 | 0; //@line 11479
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 11492
     $119 = $100 + 10 | 0; //@line 11503
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 11508
     $125 = $124 & 65535; //@line 11509
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 11511
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 11517
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 11521
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 11525
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 11529
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 11533
       $$0 = $100 + 14 | 0; //@line 11536
       $$1$i = $$090117$i + 20 | 0; //@line 11536
       $$196$i = $$095115$i + 1 | 0; //@line 11536
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 11543
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 11547
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 11551
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 11555
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 11559
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 11563
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 11567
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 11571
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 11575
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 11579
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 11583
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 11587
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 11591
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 11595
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 11599
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 11603
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 11607
        $$0 = $100 + 26 | 0; //@line 11610
        $$1$i = $$090117$i + 20 | 0; //@line 11610
        $$196$i = $$095115$i + 1 | 0; //@line 11610
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 11614
        $$1$i = $$090117$i; //@line 11614
        $$196$i = $$095115$i; //@line 11614
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 11619
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $32 >>> 0)) {
      $$089$i = $$196$i; //@line 11626
      break;
     } else {
      $$090117$i = $$1$i; //@line 11624
      $$095115$i = $$196$i; //@line 11624
      $84 = $$0; //@line 11624
     }
    }
   } else {
    $$089$i = 0; //@line 11631
   }
  } else {
   $$089$i = 0; //@line 11634
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 11638
 }
 _free($4); //@line 11640
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 11641
 $200 = __ZN6Socket5closeEv($16) | 0; //@line 11642
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 11645
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 11646
  HEAP32[$201 >> 2] = $$355; //@line 11647
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 11648
  HEAP32[$202 >> 2] = $2; //@line 11649
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 11650
  HEAP32[$203 >> 2] = $36; //@line 11651
  sp = STACKTOP; //@line 11652
  STACKTOP = sp; //@line 11653
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 11656
 ___async_unwind = 0; //@line 11657
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 11658
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 11659
 HEAP32[$201 >> 2] = $$355; //@line 11660
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 11661
 HEAP32[$202 >> 2] = $2; //@line 11662
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 11663
 HEAP32[$203 >> 2] = $36; //@line 11664
 sp = STACKTOP; //@line 11665
 STACKTOP = sp; //@line 11666
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_24($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$3 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10676
 STACKTOP = STACKTOP + 32 | 0; //@line 10677
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 10677
 $$byval_copy = sp; //@line 10678
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10680
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10682
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10684
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 10686
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10688
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10690
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10692
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10694
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10696
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10698
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10700
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10702
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10704
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10706
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10708
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 10710
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10712
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 10714
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10716
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10718
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$4 >> 0] = 0; //@line 10721
  HEAP8[$18 >> 0] = 1; //@line 10722
  HEAP8[$20 >> 0] = 1; //@line 10723
  HEAP8[$22 >> 0] = 0; //@line 10724
  HEAP8[$24 >> 0] = 0; //@line 10725
  HEAP8[$26 >> 0] = 1; //@line 10726
  HEAP8[$28 >> 0] = 0; //@line 10727
  HEAP8[$28 + 1 >> 0] = 0; //@line 10727
  HEAP8[$28 + 2 >> 0] = 0; //@line 10727
  HEAP8[$28 + 3 >> 0] = 0; //@line 10727
  HEAP8[$28 + 4 >> 0] = 0; //@line 10727
  HEAP8[$28 + 5 >> 0] = 0; //@line 10727
  if (!(HEAP8[$30 >> 0] | 0)) {
   $223 = $6; //@line 10731
  } else {
   $$019$i$3 = $30; //@line 10733
   $211 = $6; //@line 10733
   while (1) {
    $208 = _strcspn($$019$i$3, 3461) | 0; //@line 10735
    $210 = $211 + 1 | 0; //@line 10737
    HEAP8[$211 >> 0] = $208; //@line 10738
    $212 = $208 & 255; //@line 10739
    _memcpy($210 | 0, $$019$i$3 | 0, $212 | 0) | 0; //@line 10740
    $213 = $210 + $212 | 0; //@line 10741
    $$019$i$3 = $$019$i$3 + ($208 + ((HEAP8[$$019$i$3 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 10747
    if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
     $223 = $213; //@line 10751
     break;
    } else {
     $211 = $213; //@line 10754
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 10759
  HEAP8[$223 + 1 >> 0] = 0; //@line 10761
  HEAP8[$223 + 2 >> 0] = $8; //@line 10763
  HEAP8[$223 + 3 >> 0] = 0; //@line 10765
  HEAP8[$223 + 4 >> 0] = 1; //@line 10766
  HEAP32[$$byval_copy >> 2] = HEAP32[129]; //@line 10767
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[130]; //@line 10767
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[131]; //@line 10767
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[132]; //@line 10767
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[133]; //@line 10767
  __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 10768
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(80) | 0; //@line 10772
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $223 + 5 - $14 | 0) | 0; //@line 10773
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 87; //@line 10776
   $231 = $ReallocAsyncCtx7 + 4 | 0; //@line 10777
   HEAP32[$231 >> 2] = $2; //@line 10778
   $232 = $ReallocAsyncCtx7 + 8 | 0; //@line 10779
   HEAP32[$232 >> 2] = $4; //@line 10780
   $233 = $ReallocAsyncCtx7 + 12 | 0; //@line 10781
   HEAP32[$233 >> 2] = $6; //@line 10782
   $234 = $ReallocAsyncCtx7 + 16 | 0; //@line 10783
   HEAP8[$234 >> 0] = $8; //@line 10784
   $235 = $ReallocAsyncCtx7 + 20 | 0; //@line 10785
   HEAP32[$235 >> 2] = $10; //@line 10786
   $236 = $ReallocAsyncCtx7 + 24 | 0; //@line 10787
   HEAP32[$236 >> 2] = $12; //@line 10788
   $237 = $ReallocAsyncCtx7 + 28 | 0; //@line 10789
   HEAP32[$237 >> 2] = $14; //@line 10790
   $238 = $ReallocAsyncCtx7 + 32 | 0; //@line 10791
   HEAP32[$238 >> 2] = $16; //@line 10792
   $239 = $ReallocAsyncCtx7 + 36 | 0; //@line 10793
   HEAP32[$239 >> 2] = $32; //@line 10794
   $240 = $ReallocAsyncCtx7 + 40 | 0; //@line 10795
   HEAP32[$240 >> 2] = $18; //@line 10796
   $241 = $ReallocAsyncCtx7 + 44 | 0; //@line 10797
   HEAP32[$241 >> 2] = $20; //@line 10798
   $242 = $ReallocAsyncCtx7 + 48 | 0; //@line 10799
   HEAP32[$242 >> 2] = $22; //@line 10800
   $243 = $ReallocAsyncCtx7 + 52 | 0; //@line 10801
   HEAP32[$243 >> 2] = $24; //@line 10802
   $244 = $ReallocAsyncCtx7 + 56 | 0; //@line 10803
   HEAP32[$244 >> 2] = $26; //@line 10804
   $245 = $ReallocAsyncCtx7 + 60 | 0; //@line 10805
   HEAP32[$245 >> 2] = $28; //@line 10806
   $246 = $ReallocAsyncCtx7 + 64 | 0; //@line 10807
   HEAP32[$246 >> 2] = $34; //@line 10808
   $247 = $ReallocAsyncCtx7 + 68 | 0; //@line 10809
   HEAP32[$247 >> 2] = $36; //@line 10810
   $248 = $ReallocAsyncCtx7 + 72 | 0; //@line 10811
   HEAP32[$248 >> 2] = $38; //@line 10812
   $249 = $ReallocAsyncCtx7 + 76 | 0; //@line 10813
   HEAP32[$249 >> 2] = $30; //@line 10814
   sp = STACKTOP; //@line 10815
   STACKTOP = sp; //@line 10816
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 10819
  ___async_unwind = 0; //@line 10820
  HEAP32[$ReallocAsyncCtx7 >> 2] = 87; //@line 10821
  $231 = $ReallocAsyncCtx7 + 4 | 0; //@line 10822
  HEAP32[$231 >> 2] = $2; //@line 10823
  $232 = $ReallocAsyncCtx7 + 8 | 0; //@line 10824
  HEAP32[$232 >> 2] = $4; //@line 10825
  $233 = $ReallocAsyncCtx7 + 12 | 0; //@line 10826
  HEAP32[$233 >> 2] = $6; //@line 10827
  $234 = $ReallocAsyncCtx7 + 16 | 0; //@line 10828
  HEAP8[$234 >> 0] = $8; //@line 10829
  $235 = $ReallocAsyncCtx7 + 20 | 0; //@line 10830
  HEAP32[$235 >> 2] = $10; //@line 10831
  $236 = $ReallocAsyncCtx7 + 24 | 0; //@line 10832
  HEAP32[$236 >> 2] = $12; //@line 10833
  $237 = $ReallocAsyncCtx7 + 28 | 0; //@line 10834
  HEAP32[$237 >> 2] = $14; //@line 10835
  $238 = $ReallocAsyncCtx7 + 32 | 0; //@line 10836
  HEAP32[$238 >> 2] = $16; //@line 10837
  $239 = $ReallocAsyncCtx7 + 36 | 0; //@line 10838
  HEAP32[$239 >> 2] = $32; //@line 10839
  $240 = $ReallocAsyncCtx7 + 40 | 0; //@line 10840
  HEAP32[$240 >> 2] = $18; //@line 10841
  $241 = $ReallocAsyncCtx7 + 44 | 0; //@line 10842
  HEAP32[$241 >> 2] = $20; //@line 10843
  $242 = $ReallocAsyncCtx7 + 48 | 0; //@line 10844
  HEAP32[$242 >> 2] = $22; //@line 10845
  $243 = $ReallocAsyncCtx7 + 52 | 0; //@line 10846
  HEAP32[$243 >> 2] = $24; //@line 10847
  $244 = $ReallocAsyncCtx7 + 56 | 0; //@line 10848
  HEAP32[$244 >> 2] = $26; //@line 10849
  $245 = $ReallocAsyncCtx7 + 60 | 0; //@line 10850
  HEAP32[$245 >> 2] = $28; //@line 10851
  $246 = $ReallocAsyncCtx7 + 64 | 0; //@line 10852
  HEAP32[$246 >> 2] = $34; //@line 10853
  $247 = $ReallocAsyncCtx7 + 68 | 0; //@line 10854
  HEAP32[$247 >> 2] = $36; //@line 10855
  $248 = $ReallocAsyncCtx7 + 72 | 0; //@line 10856
  HEAP32[$248 >> 2] = $38; //@line 10857
  $249 = $ReallocAsyncCtx7 + 76 | 0; //@line 10858
  HEAP32[$249 >> 2] = $30; //@line 10859
  sp = STACKTOP; //@line 10860
  STACKTOP = sp; //@line 10861
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 10865
 } else {
  $55 = HEAPU8[$24 >> 0] << 8 | HEAPU8[$26 >> 0]; //@line 10881
  $61 = HEAPU8[$28 >> 0] << 8 | HEAPU8[$34 >> 0]; //@line 10887
  if (((HEAP8[$20 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$4 >> 0] << 8 | HEAPU8[$18 >> 0] | 0) == 1 : 0) & (HEAP8[$22 >> 0] & 15) == 0) {
   if (!$55) {
    $251 = $6; //@line 10897
   } else {
    $$093119$i = 0; //@line 10899
    $69 = $6; //@line 10899
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 10901
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 10904
     } else {
      $74 = $69; //@line 10906
      $76 = $68; //@line 10906
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 10910
       $76 = HEAP8[$77 >> 0] | 0; //@line 10911
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 10914
        break;
       } else {
        $74 = $77; //@line 10917
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 10921
     $$093119$i = $$093119$i + 1 | 0; //@line 10922
     if (($$093119$i | 0) >= ($55 | 0)) {
      $251 = $80; //@line 10927
      break;
     } else {
      $69 = $80; //@line 10925
     }
    }
   }
   if (($32 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $38; //@line 10936
    $$094116$i = 0; //@line 10936
    $$095115$i = 0; //@line 10936
    $84 = $251; //@line 10936
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 10939
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 10943
      } else {
       $89 = $85 & 255; //@line 10946
       $92 = $84; //@line 10946
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 10951
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 10955
        $95 = HEAP8[$94 >> 0] | 0; //@line 10956
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 10960
         break;
        } else {
         $89 = $95 & 255; //@line 10963
         $92 = $94; //@line 10963
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 10967
        $100 = $92 + 2 | 0; //@line 10969
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 10973
        $100 = $94 + 1 | 0; //@line 10975
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 10988
     $119 = $100 + 10 | 0; //@line 10999
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 11004
     $125 = $124 & 65535; //@line 11005
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 11007
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 11013
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 11017
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 11021
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 11025
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 11029
       $$0 = $100 + 14 | 0; //@line 11032
       $$1$i = $$090117$i + 20 | 0; //@line 11032
       $$196$i = $$095115$i + 1 | 0; //@line 11032
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 11039
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 11043
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 11047
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 11051
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 11055
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 11059
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 11063
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 11067
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 11071
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 11075
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 11079
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 11083
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 11087
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 11091
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 11095
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 11099
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 11103
        $$0 = $100 + 26 | 0; //@line 11106
        $$1$i = $$090117$i + 20 | 0; //@line 11106
        $$196$i = $$095115$i + 1 | 0; //@line 11106
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 11110
        $$1$i = $$090117$i; //@line 11110
        $$196$i = $$095115$i; //@line 11110
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 11115
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $32 >>> 0)) {
      $$089$i = $$196$i; //@line 11122
      break;
     } else {
      $$090117$i = $$1$i; //@line 11120
      $$095115$i = $$196$i; //@line 11120
      $84 = $$0; //@line 11120
     }
    }
   } else {
    $$089$i = 0; //@line 11127
   }
  } else {
   $$089$i = 0; //@line 11130
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 11134
 }
 _free($4); //@line 11136
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 11137
 $200 = __ZN6Socket5closeEv($16) | 0; //@line 11138
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 11141
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 11142
  HEAP32[$201 >> 2] = $$355; //@line 11143
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 11144
  HEAP32[$202 >> 2] = $2; //@line 11145
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 11146
  HEAP32[$203 >> 2] = $36; //@line 11147
  sp = STACKTOP; //@line 11148
  STACKTOP = sp; //@line 11149
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 11152
 ___async_unwind = 0; //@line 11153
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 11154
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 11155
 HEAP32[$201 >> 2] = $$355; //@line 11156
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 11157
 HEAP32[$202 >> 2] = $2; //@line 11158
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 11159
 HEAP32[$203 >> 2] = $36; //@line 11160
 sp = STACKTOP; //@line 11161
 STACKTOP = sp; //@line 11162
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_23($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$4 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $247 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx6 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10188
 STACKTOP = STACKTOP + 32 | 0; //@line 10189
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 10189
 $$byval_copy = sp; //@line 10190
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10192
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10194
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10196
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 10198
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10200
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10202
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10204
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10206
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10208
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10210
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10212
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10214
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10216
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10218
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10220
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 10222
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10224
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 10226
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10228
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10230
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$4 >> 0] = 0; //@line 10233
  HEAP8[$18 >> 0] = 1; //@line 10234
  HEAP8[$20 >> 0] = 1; //@line 10235
  HEAP8[$22 >> 0] = 0; //@line 10236
  HEAP8[$24 >> 0] = 0; //@line 10237
  HEAP8[$26 >> 0] = 1; //@line 10238
  HEAP8[$28 >> 0] = 0; //@line 10239
  HEAP8[$28 + 1 >> 0] = 0; //@line 10239
  HEAP8[$28 + 2 >> 0] = 0; //@line 10239
  HEAP8[$28 + 3 >> 0] = 0; //@line 10239
  HEAP8[$28 + 4 >> 0] = 0; //@line 10239
  HEAP8[$28 + 5 >> 0] = 0; //@line 10239
  if (!(HEAP8[$30 >> 0] | 0)) {
   $223 = $6; //@line 10243
  } else {
   $$019$i$4 = $30; //@line 10245
   $211 = $6; //@line 10245
   while (1) {
    $208 = _strcspn($$019$i$4, 3461) | 0; //@line 10247
    $210 = $211 + 1 | 0; //@line 10249
    HEAP8[$211 >> 0] = $208; //@line 10250
    $212 = $208 & 255; //@line 10251
    _memcpy($210 | 0, $$019$i$4 | 0, $212 | 0) | 0; //@line 10252
    $213 = $210 + $212 | 0; //@line 10253
    $$019$i$4 = $$019$i$4 + ($208 + ((HEAP8[$$019$i$4 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 10259
    if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
     $223 = $213; //@line 10263
     break;
    } else {
     $211 = $213; //@line 10266
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 10271
  HEAP8[$223 + 1 >> 0] = 0; //@line 10273
  HEAP8[$223 + 2 >> 0] = $8; //@line 10275
  HEAP8[$223 + 3 >> 0] = 0; //@line 10277
  HEAP8[$223 + 4 >> 0] = 1; //@line 10278
  HEAP32[$$byval_copy >> 2] = HEAP32[134]; //@line 10279
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[135]; //@line 10279
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[136]; //@line 10279
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[137]; //@line 10279
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[138]; //@line 10279
  __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 10280
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 10284
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $223 + 5 - $14 | 0) | 0; //@line 10285
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 89; //@line 10288
   $231 = $ReallocAsyncCtx6 + 4 | 0; //@line 10289
   HEAP32[$231 >> 2] = $2; //@line 10290
   $232 = $ReallocAsyncCtx6 + 8 | 0; //@line 10291
   HEAP32[$232 >> 2] = $4; //@line 10292
   $233 = $ReallocAsyncCtx6 + 12 | 0; //@line 10293
   HEAP32[$233 >> 2] = $16; //@line 10294
   $234 = $ReallocAsyncCtx6 + 16 | 0; //@line 10295
   HEAP32[$234 >> 2] = $32; //@line 10296
   $235 = $ReallocAsyncCtx6 + 20 | 0; //@line 10297
   HEAP32[$235 >> 2] = $6; //@line 10298
   $236 = $ReallocAsyncCtx6 + 24 | 0; //@line 10299
   HEAP32[$236 >> 2] = $10; //@line 10300
   $237 = $ReallocAsyncCtx6 + 28 | 0; //@line 10301
   HEAP32[$237 >> 2] = $18; //@line 10302
   $238 = $ReallocAsyncCtx6 + 32 | 0; //@line 10303
   HEAP32[$238 >> 2] = $20; //@line 10304
   $239 = $ReallocAsyncCtx6 + 36 | 0; //@line 10305
   HEAP32[$239 >> 2] = $22; //@line 10306
   $240 = $ReallocAsyncCtx6 + 40 | 0; //@line 10307
   HEAP32[$240 >> 2] = $24; //@line 10308
   $241 = $ReallocAsyncCtx6 + 44 | 0; //@line 10309
   HEAP32[$241 >> 2] = $26; //@line 10310
   $242 = $ReallocAsyncCtx6 + 48 | 0; //@line 10311
   HEAP32[$242 >> 2] = $28; //@line 10312
   $243 = $ReallocAsyncCtx6 + 52 | 0; //@line 10313
   HEAP32[$243 >> 2] = $34; //@line 10314
   $244 = $ReallocAsyncCtx6 + 56 | 0; //@line 10315
   HEAP32[$244 >> 2] = $36; //@line 10316
   $245 = $ReallocAsyncCtx6 + 60 | 0; //@line 10317
   HEAP32[$245 >> 2] = $38; //@line 10318
   sp = STACKTOP; //@line 10319
   STACKTOP = sp; //@line 10320
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 10323
  ___async_unwind = 0; //@line 10324
  HEAP32[$ReallocAsyncCtx6 >> 2] = 89; //@line 10325
  $231 = $ReallocAsyncCtx6 + 4 | 0; //@line 10326
  HEAP32[$231 >> 2] = $2; //@line 10327
  $232 = $ReallocAsyncCtx6 + 8 | 0; //@line 10328
  HEAP32[$232 >> 2] = $4; //@line 10329
  $233 = $ReallocAsyncCtx6 + 12 | 0; //@line 10330
  HEAP32[$233 >> 2] = $16; //@line 10331
  $234 = $ReallocAsyncCtx6 + 16 | 0; //@line 10332
  HEAP32[$234 >> 2] = $32; //@line 10333
  $235 = $ReallocAsyncCtx6 + 20 | 0; //@line 10334
  HEAP32[$235 >> 2] = $6; //@line 10335
  $236 = $ReallocAsyncCtx6 + 24 | 0; //@line 10336
  HEAP32[$236 >> 2] = $10; //@line 10337
  $237 = $ReallocAsyncCtx6 + 28 | 0; //@line 10338
  HEAP32[$237 >> 2] = $18; //@line 10339
  $238 = $ReallocAsyncCtx6 + 32 | 0; //@line 10340
  HEAP32[$238 >> 2] = $20; //@line 10341
  $239 = $ReallocAsyncCtx6 + 36 | 0; //@line 10342
  HEAP32[$239 >> 2] = $22; //@line 10343
  $240 = $ReallocAsyncCtx6 + 40 | 0; //@line 10344
  HEAP32[$240 >> 2] = $24; //@line 10345
  $241 = $ReallocAsyncCtx6 + 44 | 0; //@line 10346
  HEAP32[$241 >> 2] = $26; //@line 10347
  $242 = $ReallocAsyncCtx6 + 48 | 0; //@line 10348
  HEAP32[$242 >> 2] = $28; //@line 10349
  $243 = $ReallocAsyncCtx6 + 52 | 0; //@line 10350
  HEAP32[$243 >> 2] = $34; //@line 10351
  $244 = $ReallocAsyncCtx6 + 56 | 0; //@line 10352
  HEAP32[$244 >> 2] = $36; //@line 10353
  $245 = $ReallocAsyncCtx6 + 60 | 0; //@line 10354
  HEAP32[$245 >> 2] = $38; //@line 10355
  sp = STACKTOP; //@line 10356
  STACKTOP = sp; //@line 10357
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 10361
 } else {
  $55 = HEAPU8[$24 >> 0] << 8 | HEAPU8[$26 >> 0]; //@line 10377
  $61 = HEAPU8[$28 >> 0] << 8 | HEAPU8[$34 >> 0]; //@line 10383
  if (((HEAP8[$20 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$4 >> 0] << 8 | HEAPU8[$18 >> 0] | 0) == 1 : 0) & (HEAP8[$22 >> 0] & 15) == 0) {
   if (!$55) {
    $247 = $6; //@line 10393
   } else {
    $$093119$i = 0; //@line 10395
    $69 = $6; //@line 10395
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 10397
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 10400
     } else {
      $74 = $69; //@line 10402
      $76 = $68; //@line 10402
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 10406
       $76 = HEAP8[$77 >> 0] | 0; //@line 10407
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 10410
        break;
       } else {
        $74 = $77; //@line 10413
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 10417
     $$093119$i = $$093119$i + 1 | 0; //@line 10418
     if (($$093119$i | 0) >= ($55 | 0)) {
      $247 = $80; //@line 10423
      break;
     } else {
      $69 = $80; //@line 10421
     }
    }
   }
   if (($32 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $38; //@line 10432
    $$094116$i = 0; //@line 10432
    $$095115$i = 0; //@line 10432
    $84 = $247; //@line 10432
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 10435
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 10439
      } else {
       $89 = $85 & 255; //@line 10442
       $92 = $84; //@line 10442
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 10447
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 10451
        $95 = HEAP8[$94 >> 0] | 0; //@line 10452
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 10456
         break;
        } else {
         $89 = $95 & 255; //@line 10459
         $92 = $94; //@line 10459
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 10463
        $100 = $92 + 2 | 0; //@line 10465
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 10469
        $100 = $94 + 1 | 0; //@line 10471
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 10484
     $119 = $100 + 10 | 0; //@line 10495
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 10500
     $125 = $124 & 65535; //@line 10501
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 10503
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 10509
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 10513
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 10517
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 10521
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 10525
       $$0 = $100 + 14 | 0; //@line 10528
       $$1$i = $$090117$i + 20 | 0; //@line 10528
       $$196$i = $$095115$i + 1 | 0; //@line 10528
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 10535
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 10539
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 10543
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 10547
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 10551
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 10555
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 10559
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 10563
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 10567
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 10571
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 10575
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 10579
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 10583
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 10587
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 10591
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 10595
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 10599
        $$0 = $100 + 26 | 0; //@line 10602
        $$1$i = $$090117$i + 20 | 0; //@line 10602
        $$196$i = $$095115$i + 1 | 0; //@line 10602
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 10606
        $$1$i = $$090117$i; //@line 10606
        $$196$i = $$095115$i; //@line 10606
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 10611
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $32 >>> 0)) {
      $$089$i = $$196$i; //@line 10618
      break;
     } else {
      $$090117$i = $$1$i; //@line 10616
      $$095115$i = $$196$i; //@line 10616
      $84 = $$0; //@line 10616
     }
    }
   } else {
    $$089$i = 0; //@line 10623
   }
  } else {
   $$089$i = 0; //@line 10626
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 10630
 }
 _free($4); //@line 10632
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 10633
 $200 = __ZN6Socket5closeEv($16) | 0; //@line 10634
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 10637
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 10638
  HEAP32[$201 >> 2] = $$355; //@line 10639
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 10640
  HEAP32[$202 >> 2] = $2; //@line 10641
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 10642
  HEAP32[$203 >> 2] = $36; //@line 10643
  sp = STACKTOP; //@line 10644
  STACKTOP = sp; //@line 10645
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 10648
 ___async_unwind = 0; //@line 10649
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 10650
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 10651
 HEAP32[$201 >> 2] = $$355; //@line 10652
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 10653
 HEAP32[$202 >> 2] = $2; //@line 10654
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 10655
 HEAP32[$203 >> 2] = $36; //@line 10656
 sp = STACKTOP; //@line 10657
 STACKTOP = sp; //@line 10658
 return;
}
function _hexfloat($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$0133 = 0, $$0142 = 0, $$0146 = 0, $$0148 = 0, $$0151 = 0.0, $$0152 = 0.0, $$0155 = 0.0, $$0159 = 0, $$0165 = 0.0, $$0166 = 0, $$0166169 = 0, $$0166170 = 0, $$1$ph = 0, $$1147 = 0, $$1149 = 0, $$1153 = 0.0, $$1156 = 0.0, $$1160 = 0, $$2 = 0, $$2$lcssa = 0, $$2144 = 0, $$2150 = 0, $$2154 = 0.0, $$2157 = 0.0, $$2161 = 0, $$3145 = 0, $$3158$lcssa = 0.0, $$3158179 = 0.0, $$3162$lcssa = 0, $$3162183 = 0, $$4 = 0.0, $$4163$lcssa = 0, $$4163178 = 0, $$5164 = 0, $$pre = 0, $$pre$phi201Z2D = 0.0, $104 = 0, $105 = 0, $106 = 0, $116 = 0, $117 = 0, $130 = 0, $132 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $141 = 0, $143 = 0, $153 = 0, $155 = 0, $166 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $176 = 0, $179 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $193 = 0.0, $194 = 0, $207 = 0.0, $21 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $29 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $41 = 0, $42 = 0, $46 = 0, $5 = 0, $51 = 0, $53 = 0, $6 = 0, $65 = 0.0, $7 = 0, $72 = 0, $74 = 0, $83 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $or$cond = 0, $or$cond168 = 0, label = 0, $105$looptemp = 0;
 $5 = $0 + 4 | 0; //@line 1158
 $6 = HEAP32[$5 >> 2] | 0; //@line 1159
 $7 = $0 + 100 | 0; //@line 1160
 if ($6 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
  HEAP32[$5 >> 2] = $6 + 1; //@line 1165
  $$0 = HEAPU8[$6 >> 0] | 0; //@line 1168
  $$0142 = 0; //@line 1168
 } else {
  $$0 = ___shgetc($0) | 0; //@line 1171
  $$0142 = 0; //@line 1171
 }
 L4 : while (1) {
  switch ($$0 | 0) {
  case 46:
   {
    label = 8; //@line 1176
    break L4;
    break;
   }
  case 48:
   {
    break;
   }
  default:
   {
    $$0146 = 0; //@line 1184
    $$0148 = 0; //@line 1184
    $$0152 = 1.0; //@line 1184
    $$0155 = 0.0; //@line 1184
    $$0159 = 0; //@line 1184
    $$2 = $$0; //@line 1184
    $$2144 = $$0142; //@line 1184
    $51 = 0; //@line 1184
    $53 = 0; //@line 1184
    $96 = 0; //@line 1184
    $98 = 0; //@line 1184
    break L4;
   }
  }
  $14 = HEAP32[$5 >> 2] | 0; //@line 1188
  if ($14 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $14 + 1; //@line 1193
   $$0 = HEAPU8[$14 >> 0] | 0; //@line 1196
   $$0142 = 1; //@line 1196
   continue;
  } else {
   $$0 = ___shgetc($0) | 0; //@line 1200
   $$0142 = 1; //@line 1200
   continue;
  }
 }
 if ((label | 0) == 8) {
  $21 = HEAP32[$5 >> 2] | 0; //@line 1205
  if ($21 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $21 + 1; //@line 1210
   $$1$ph = HEAPU8[$21 >> 0] | 0; //@line 1213
  } else {
   $$1$ph = ___shgetc($0) | 0; //@line 1216
  }
  if (($$1$ph | 0) == 48) {
   $36 = 0; //@line 1220
   $37 = 0; //@line 1220
   while (1) {
    $29 = HEAP32[$5 >> 2] | 0; //@line 1222
    if ($29 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
     HEAP32[$5 >> 2] = $29 + 1; //@line 1227
     $41 = HEAPU8[$29 >> 0] | 0; //@line 1230
    } else {
     $41 = ___shgetc($0) | 0; //@line 1233
    }
    $38 = _i64Add($36 | 0, $37 | 0, -1, -1) | 0; //@line 1235
    $39 = tempRet0; //@line 1236
    if (($41 | 0) == 48) {
     $36 = $38; //@line 1239
     $37 = $39; //@line 1239
    } else {
     $$0146 = 1; //@line 1241
     $$0148 = 0; //@line 1241
     $$0152 = 1.0; //@line 1241
     $$0155 = 0.0; //@line 1241
     $$0159 = 0; //@line 1241
     $$2 = $41; //@line 1241
     $$2144 = 1; //@line 1241
     $51 = 0; //@line 1241
     $53 = 0; //@line 1241
     $96 = $38; //@line 1241
     $98 = $39; //@line 1241
     break;
    }
   }
  } else {
   $$0146 = 1; //@line 1246
   $$0148 = 0; //@line 1246
   $$0152 = 1.0; //@line 1246
   $$0155 = 0.0; //@line 1246
   $$0159 = 0; //@line 1246
   $$2 = $$1$ph; //@line 1246
   $$2144 = $$0142; //@line 1246
   $51 = 0; //@line 1246
   $53 = 0; //@line 1246
   $96 = 0; //@line 1246
   $98 = 0; //@line 1246
  }
 }
 while (1) {
  $42 = $$2 + -48 | 0; //@line 1250
  $$pre = $$2 | 32; //@line 1252
  if ($42 >>> 0 < 10) {
   label = 20; //@line 1254
  } else {
   $46 = ($$2 | 0) == 46; //@line 1258
   if (!($46 | ($$pre + -97 | 0) >>> 0 < 6)) {
    $$2$lcssa = $$2; //@line 1261
    break;
   }
   if ($46) {
    if (!$$0146) {
     $$1147 = 1; //@line 1267
     $$2150 = $$0148; //@line 1267
     $$2154 = $$0152; //@line 1267
     $$2157 = $$0155; //@line 1267
     $$2161 = $$0159; //@line 1267
     $$3145 = $$2144; //@line 1267
     $211 = $53; //@line 1267
     $212 = $51; //@line 1267
     $213 = $53; //@line 1267
     $214 = $51; //@line 1267
    } else {
     $$2$lcssa = 46; //@line 1269
     break;
    }
   } else {
    label = 20; //@line 1273
   }
  }
  if ((label | 0) == 20) {
   label = 0; //@line 1277
   $$0133 = ($$2 | 0) > 57 ? $$pre + -87 | 0 : $42; //@line 1280
   do {
    if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 8) {
     $$1149 = $$0148; //@line 1290
     $$1153 = $$0152; //@line 1290
     $$1156 = $$0155; //@line 1290
     $$1160 = $$0133 + ($$0159 << 4) | 0; //@line 1290
    } else {
     if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 14) {
      $65 = $$0152 * .0625; //@line 1299
      $$1149 = $$0148; //@line 1302
      $$1153 = $65; //@line 1302
      $$1156 = $$0155 + $65 * +($$0133 | 0); //@line 1302
      $$1160 = $$0159; //@line 1302
      break;
     } else {
      $or$cond = ($$0148 | 0) != 0 | ($$0133 | 0) == 0; //@line 1307
      $$1149 = $or$cond ? $$0148 : 1; //@line 1312
      $$1153 = $$0152; //@line 1312
      $$1156 = $or$cond ? $$0155 : $$0155 + $$0152 * .5; //@line 1312
      $$1160 = $$0159; //@line 1312
      break;
     }
    }
   } while (0);
   $72 = _i64Add($53 | 0, $51 | 0, 1, 0) | 0; //@line 1317
   $$1147 = $$0146; //@line 1319
   $$2150 = $$1149; //@line 1319
   $$2154 = $$1153; //@line 1319
   $$2157 = $$1156; //@line 1319
   $$2161 = $$1160; //@line 1319
   $$3145 = 1; //@line 1319
   $211 = $96; //@line 1319
   $212 = $98; //@line 1319
   $213 = $72; //@line 1319
   $214 = tempRet0; //@line 1319
  }
  $74 = HEAP32[$5 >> 2] | 0; //@line 1321
  if ($74 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $74 + 1; //@line 1326
   $$0146 = $$1147; //@line 1329
   $$0148 = $$2150; //@line 1329
   $$0152 = $$2154; //@line 1329
   $$0155 = $$2157; //@line 1329
   $$0159 = $$2161; //@line 1329
   $$2 = HEAPU8[$74 >> 0] | 0; //@line 1329
   $$2144 = $$3145; //@line 1329
   $51 = $214; //@line 1329
   $53 = $213; //@line 1329
   $96 = $211; //@line 1329
   $98 = $212; //@line 1329
   continue;
  } else {
   $$0146 = $$1147; //@line 1333
   $$0148 = $$2150; //@line 1333
   $$0152 = $$2154; //@line 1333
   $$0155 = $$2157; //@line 1333
   $$0159 = $$2161; //@line 1333
   $$2 = ___shgetc($0) | 0; //@line 1333
   $$2144 = $$3145; //@line 1333
   $51 = $214; //@line 1333
   $53 = $213; //@line 1333
   $96 = $211; //@line 1333
   $98 = $212; //@line 1333
   continue;
  }
 }
 do {
  if (!$$2144) {
   $83 = (HEAP32[$7 >> 2] | 0) == 0; //@line 1341
   if (!$83) {
    HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1345
   }
   if (!$4) {
    ___shlim($0, 0); //@line 1349
   } else {
    if (!$83) {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1354
    }
    if (!(($$0146 | 0) == 0 | $83)) {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1361
    }
   }
   $$0165 = +($3 | 0) * 0.0; //@line 1366
  } else {
   $94 = ($$0146 | 0) == 0; //@line 1368
   $95 = $94 ? $53 : $96; //@line 1369
   $97 = $94 ? $51 : $98; //@line 1370
   if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 8) {
    $$3162183 = $$0159; //@line 1377
    $105 = $53; //@line 1377
    $106 = $51; //@line 1377
    while (1) {
     $104 = $$3162183 << 4; //@line 1379
     $105$looptemp = $105;
     $105 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 1380
     if (!(($106 | 0) < 0 | ($106 | 0) == 0 & $105$looptemp >>> 0 < 7)) {
      $$3162$lcssa = $104; //@line 1390
      break;
     } else {
      $$3162183 = $104; //@line 1388
      $106 = tempRet0; //@line 1388
     }
    }
   } else {
    $$3162$lcssa = $$0159; //@line 1395
   }
   if (($$2$lcssa | 32 | 0) == 112) {
    $116 = _scanexp($0, $4) | 0; //@line 1400
    $117 = tempRet0; //@line 1401
    if (($116 | 0) == 0 & ($117 | 0) == -2147483648) {
     if (!$4) {
      ___shlim($0, 0); //@line 1408
      $$0165 = 0.0; //@line 1409
      break;
     }
     if (!(HEAP32[$7 >> 2] | 0)) {
      $134 = 0; //@line 1415
      $135 = 0; //@line 1415
     } else {
      HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1419
      $134 = 0; //@line 1420
      $135 = 0; //@line 1420
     }
    } else {
     $134 = $116; //@line 1423
     $135 = $117; //@line 1423
    }
   } else {
    if (!(HEAP32[$7 >> 2] | 0)) {
     $134 = 0; //@line 1429
     $135 = 0; //@line 1429
    } else {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1433
     $134 = 0; //@line 1434
     $135 = 0; //@line 1434
    }
   }
   $130 = _bitshift64Shl($95 | 0, $97 | 0, 2) | 0; //@line 1437
   $132 = _i64Add($130 | 0, tempRet0 | 0, -32, -1) | 0; //@line 1439
   $136 = _i64Add($132 | 0, tempRet0 | 0, $134 | 0, $135 | 0) | 0; //@line 1441
   $137 = tempRet0; //@line 1442
   if (!$$3162$lcssa) {
    $$0165 = +($3 | 0) * 0.0; //@line 1447
    break;
   }
   $141 = 0 - $2 | 0; //@line 1450
   $143 = (($141 | 0) < 0) << 31 >> 31; //@line 1452
   if (($137 | 0) > ($143 | 0) | ($137 | 0) == ($143 | 0) & $136 >>> 0 > $141 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1460
    $$0165 = +($3 | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308; //@line 1464
    break;
   }
   $153 = $2 + -106 | 0; //@line 1467
   $155 = (($153 | 0) < 0) << 31 >> 31; //@line 1469
   if (($137 | 0) < ($155 | 0) | ($137 | 0) == ($155 | 0) & $136 >>> 0 < $153 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1477
    $$0165 = +($3 | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308; //@line 1481
    break;
   }
   if (($$3162$lcssa | 0) > -1) {
    $$3158179 = $$0155; //@line 1486
    $$4163178 = $$3162$lcssa; //@line 1486
    $170 = $136; //@line 1486
    $171 = $137; //@line 1486
    while (1) {
     $166 = !($$3158179 >= .5); //@line 1488
     $$5164 = $$4163178 << 1 | ($166 ^ 1) & 1; //@line 1493
     $$4 = $$3158179 + ($166 ? $$3158179 : $$3158179 + -1.0); //@line 1495
     $172 = _i64Add($170 | 0, $171 | 0, -1, -1) | 0; //@line 1496
     $173 = tempRet0; //@line 1497
     if (($$5164 | 0) > -1) {
      $$3158179 = $$4; //@line 1500
      $$4163178 = $$5164; //@line 1500
      $170 = $172; //@line 1500
      $171 = $173; //@line 1500
     } else {
      $$3158$lcssa = $$4; //@line 1502
      $$4163$lcssa = $$5164; //@line 1502
      $181 = $172; //@line 1502
      $182 = $173; //@line 1502
      break;
     }
    }
   } else {
    $$3158$lcssa = $$0155; //@line 1507
    $$4163$lcssa = $$3162$lcssa; //@line 1507
    $181 = $136; //@line 1507
    $182 = $137; //@line 1507
   }
   $176 = (($1 | 0) < 0) << 31 >> 31; //@line 1510
   $179 = _i64Subtract(32, 0, $2 | 0, (($2 | 0) < 0) << 31 >> 31 | 0) | 0; //@line 1513
   $183 = _i64Add($179 | 0, tempRet0 | 0, $181 | 0, $182 | 0) | 0; //@line 1515
   $184 = tempRet0; //@line 1516
   if (($184 | 0) < ($176 | 0) | ($184 | 0) == ($176 | 0) & $183 >>> 0 < $1 >>> 0) {
    if (($183 | 0) > 0) {
     $$0166 = $183; //@line 1525
     label = 59; //@line 1526
    } else {
     $$0166170 = 0; //@line 1528
     $194 = 84; //@line 1528
     label = 61; //@line 1529
    }
   } else {
    $$0166 = $1; //@line 1532
    label = 59; //@line 1533
   }
   if ((label | 0) == 59) {
    if (($$0166 | 0) < 53) {
     $$0166170 = $$0166; //@line 1539
     $194 = 84 - $$0166 | 0; //@line 1539
     label = 61; //@line 1540
    } else {
     $$0151 = 0.0; //@line 1543
     $$0166169 = $$0166; //@line 1543
     $$pre$phi201Z2D = +($3 | 0); //@line 1543
    }
   }
   if ((label | 0) == 61) {
    $193 = +($3 | 0); //@line 1547
    $$0151 = +_copysignl(+_scalbn(1.0, $194), $193); //@line 1550
    $$0166169 = $$0166170; //@line 1550
    $$pre$phi201Z2D = $193; //@line 1550
   }
   $or$cond168 = ($$4163$lcssa & 1 | 0) == 0 & ($$3158$lcssa != 0.0 & ($$0166169 | 0) < 32); //@line 1557
   $207 = ($or$cond168 ? 0.0 : $$3158$lcssa) * $$pre$phi201Z2D + ($$0151 + $$pre$phi201Z2D * +(($$4163$lcssa + ($or$cond168 & 1) | 0) >>> 0)) - $$0151; //@line 1566
   if (!($207 != 0.0)) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1570
   }
   $$0165 = +_scalbnl($207, $181); //@line 1573
  }
 } while (0);
 return +$$0165;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_29($0) {
 $0 = $0 | 0;
 var $$019$i$3 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12558
 STACKTOP = STACKTOP + 32 | 0; //@line 12559
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 12559
 $$byval_copy = sp; //@line 12560
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12562
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12564
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12566
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12568
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12570
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12572
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12574
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12576
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12578
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12580
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12582
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12584
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12586
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12588
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12590
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12592
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12594
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12596
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12598
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(80) | 0; //@line 12603
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($2, 0, $4, 512) | 0; //@line 12604
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 12607
   $42 = $ReallocAsyncCtx3 + 4 | 0; //@line 12608
   HEAP32[$42 >> 2] = $2; //@line 12609
   $43 = $ReallocAsyncCtx3 + 8 | 0; //@line 12610
   HEAP32[$43 >> 2] = $4; //@line 12611
   $44 = $ReallocAsyncCtx3 + 12 | 0; //@line 12612
   HEAP32[$44 >> 2] = $6; //@line 12613
   $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 12614
   HEAP8[$45 >> 0] = $8; //@line 12615
   $46 = $ReallocAsyncCtx3 + 20 | 0; //@line 12616
   HEAP32[$46 >> 2] = $10; //@line 12617
   $47 = $ReallocAsyncCtx3 + 24 | 0; //@line 12618
   HEAP32[$47 >> 2] = $12; //@line 12619
   $48 = $ReallocAsyncCtx3 + 28 | 0; //@line 12620
   HEAP32[$48 >> 2] = $14; //@line 12621
   $49 = $ReallocAsyncCtx3 + 32 | 0; //@line 12622
   HEAP32[$49 >> 2] = $16; //@line 12623
   $50 = $ReallocAsyncCtx3 + 36 | 0; //@line 12624
   HEAP32[$50 >> 2] = $20; //@line 12625
   $51 = $ReallocAsyncCtx3 + 40 | 0; //@line 12626
   HEAP32[$51 >> 2] = $22; //@line 12627
   $52 = $ReallocAsyncCtx3 + 44 | 0; //@line 12628
   HEAP32[$52 >> 2] = $24; //@line 12629
   $53 = $ReallocAsyncCtx3 + 48 | 0; //@line 12630
   HEAP32[$53 >> 2] = $26; //@line 12631
   $54 = $ReallocAsyncCtx3 + 52 | 0; //@line 12632
   HEAP32[$54 >> 2] = $28; //@line 12633
   $55 = $ReallocAsyncCtx3 + 56 | 0; //@line 12634
   HEAP32[$55 >> 2] = $30; //@line 12635
   $56 = $ReallocAsyncCtx3 + 60 | 0; //@line 12636
   HEAP32[$56 >> 2] = $38; //@line 12637
   $57 = $ReallocAsyncCtx3 + 64 | 0; //@line 12638
   HEAP32[$57 >> 2] = $18; //@line 12639
   $58 = $ReallocAsyncCtx3 + 68 | 0; //@line 12640
   HEAP32[$58 >> 2] = $32; //@line 12641
   $59 = $ReallocAsyncCtx3 + 72 | 0; //@line 12642
   HEAP32[$59 >> 2] = $34; //@line 12643
   $60 = $ReallocAsyncCtx3 + 76 | 0; //@line 12644
   HEAP32[$60 >> 2] = $36; //@line 12645
   sp = STACKTOP; //@line 12646
   STACKTOP = sp; //@line 12647
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 12650
  ___async_unwind = 0; //@line 12651
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 12652
  $42 = $ReallocAsyncCtx3 + 4 | 0; //@line 12653
  HEAP32[$42 >> 2] = $2; //@line 12654
  $43 = $ReallocAsyncCtx3 + 8 | 0; //@line 12655
  HEAP32[$43 >> 2] = $4; //@line 12656
  $44 = $ReallocAsyncCtx3 + 12 | 0; //@line 12657
  HEAP32[$44 >> 2] = $6; //@line 12658
  $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 12659
  HEAP8[$45 >> 0] = $8; //@line 12660
  $46 = $ReallocAsyncCtx3 + 20 | 0; //@line 12661
  HEAP32[$46 >> 2] = $10; //@line 12662
  $47 = $ReallocAsyncCtx3 + 24 | 0; //@line 12663
  HEAP32[$47 >> 2] = $12; //@line 12664
  $48 = $ReallocAsyncCtx3 + 28 | 0; //@line 12665
  HEAP32[$48 >> 2] = $14; //@line 12666
  $49 = $ReallocAsyncCtx3 + 32 | 0; //@line 12667
  HEAP32[$49 >> 2] = $16; //@line 12668
  $50 = $ReallocAsyncCtx3 + 36 | 0; //@line 12669
  HEAP32[$50 >> 2] = $20; //@line 12670
  $51 = $ReallocAsyncCtx3 + 40 | 0; //@line 12671
  HEAP32[$51 >> 2] = $22; //@line 12672
  $52 = $ReallocAsyncCtx3 + 44 | 0; //@line 12673
  HEAP32[$52 >> 2] = $24; //@line 12674
  $53 = $ReallocAsyncCtx3 + 48 | 0; //@line 12675
  HEAP32[$53 >> 2] = $26; //@line 12676
  $54 = $ReallocAsyncCtx3 + 52 | 0; //@line 12677
  HEAP32[$54 >> 2] = $28; //@line 12678
  $55 = $ReallocAsyncCtx3 + 56 | 0; //@line 12679
  HEAP32[$55 >> 2] = $30; //@line 12680
  $56 = $ReallocAsyncCtx3 + 60 | 0; //@line 12681
  HEAP32[$56 >> 2] = $38; //@line 12682
  $57 = $ReallocAsyncCtx3 + 64 | 0; //@line 12683
  HEAP32[$57 >> 2] = $18; //@line 12684
  $58 = $ReallocAsyncCtx3 + 68 | 0; //@line 12685
  HEAP32[$58 >> 2] = $32; //@line 12686
  $59 = $ReallocAsyncCtx3 + 72 | 0; //@line 12687
  HEAP32[$59 >> 2] = $34; //@line 12688
  $60 = $ReallocAsyncCtx3 + 76 | 0; //@line 12689
  HEAP32[$60 >> 2] = $36; //@line 12690
  sp = STACKTOP; //@line 12691
  STACKTOP = sp; //@line 12692
  return;
 }
 HEAP8[$4 >> 0] = 0; //@line 12694
 HEAP8[$20 >> 0] = 1; //@line 12695
 HEAP8[$22 >> 0] = 1; //@line 12696
 HEAP8[$24 >> 0] = 0; //@line 12697
 HEAP8[$26 >> 0] = 0; //@line 12698
 HEAP8[$28 >> 0] = 1; //@line 12699
 HEAP8[$30 >> 0] = 0; //@line 12700
 HEAP8[$30 + 1 >> 0] = 0; //@line 12700
 HEAP8[$30 + 2 >> 0] = 0; //@line 12700
 HEAP8[$30 + 3 >> 0] = 0; //@line 12700
 HEAP8[$30 + 4 >> 0] = 0; //@line 12700
 HEAP8[$30 + 5 >> 0] = 0; //@line 12700
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $6; //@line 12704
 } else {
  $$019$i$3 = $38; //@line 12706
  $67 = $6; //@line 12706
  while (1) {
   $64 = _strcspn($$019$i$3, 3461) | 0; //@line 12708
   $66 = $67 + 1 | 0; //@line 12710
   HEAP8[$67 >> 0] = $64; //@line 12711
   $68 = $64 & 255; //@line 12712
   _memcpy($66 | 0, $$019$i$3 | 0, $68 | 0) | 0; //@line 12713
   $69 = $66 + $68 | 0; //@line 12714
   $$019$i$3 = $$019$i$3 + ($64 + ((HEAP8[$$019$i$3 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 12720
   if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
    $79 = $69; //@line 12724
    break;
   } else {
    $67 = $69; //@line 12727
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 12732
 HEAP8[$79 + 1 >> 0] = 0; //@line 12734
 HEAP8[$79 + 2 >> 0] = $8; //@line 12736
 HEAP8[$79 + 3 >> 0] = 0; //@line 12738
 HEAP8[$79 + 4 >> 0] = 1; //@line 12739
 HEAP32[$$byval_copy >> 2] = HEAP32[129]; //@line 12740
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[130]; //@line 12740
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[131]; //@line 12740
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[132]; //@line 12740
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[133]; //@line 12740
 __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 12741
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(80) | 0; //@line 12745
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $79 + 5 - $14 | 0) | 0; //@line 12746
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 87; //@line 12749
  $87 = $ReallocAsyncCtx7 + 4 | 0; //@line 12750
  HEAP32[$87 >> 2] = $2; //@line 12751
  $88 = $ReallocAsyncCtx7 + 8 | 0; //@line 12752
  HEAP32[$88 >> 2] = $4; //@line 12753
  $89 = $ReallocAsyncCtx7 + 12 | 0; //@line 12754
  HEAP32[$89 >> 2] = $6; //@line 12755
  $90 = $ReallocAsyncCtx7 + 16 | 0; //@line 12756
  HEAP8[$90 >> 0] = $8; //@line 12757
  $91 = $ReallocAsyncCtx7 + 20 | 0; //@line 12758
  HEAP32[$91 >> 2] = $10; //@line 12759
  $92 = $ReallocAsyncCtx7 + 24 | 0; //@line 12760
  HEAP32[$92 >> 2] = $12; //@line 12761
  $93 = $ReallocAsyncCtx7 + 28 | 0; //@line 12762
  HEAP32[$93 >> 2] = $14; //@line 12763
  $94 = $ReallocAsyncCtx7 + 32 | 0; //@line 12764
  HEAP32[$94 >> 2] = $16; //@line 12765
  $95 = $ReallocAsyncCtx7 + 36 | 0; //@line 12766
  HEAP32[$95 >> 2] = $18; //@line 12767
  $96 = $ReallocAsyncCtx7 + 40 | 0; //@line 12768
  HEAP32[$96 >> 2] = $20; //@line 12769
  $97 = $ReallocAsyncCtx7 + 44 | 0; //@line 12770
  HEAP32[$97 >> 2] = $22; //@line 12771
  $98 = $ReallocAsyncCtx7 + 48 | 0; //@line 12772
  HEAP32[$98 >> 2] = $24; //@line 12773
  $99 = $ReallocAsyncCtx7 + 52 | 0; //@line 12774
  HEAP32[$99 >> 2] = $26; //@line 12775
  $100 = $ReallocAsyncCtx7 + 56 | 0; //@line 12776
  HEAP32[$100 >> 2] = $28; //@line 12777
  $101 = $ReallocAsyncCtx7 + 60 | 0; //@line 12778
  HEAP32[$101 >> 2] = $30; //@line 12779
  $102 = $ReallocAsyncCtx7 + 64 | 0; //@line 12780
  HEAP32[$102 >> 2] = $32; //@line 12781
  $103 = $ReallocAsyncCtx7 + 68 | 0; //@line 12782
  HEAP32[$103 >> 2] = $34; //@line 12783
  $104 = $ReallocAsyncCtx7 + 72 | 0; //@line 12784
  HEAP32[$104 >> 2] = $36; //@line 12785
  $105 = $ReallocAsyncCtx7 + 76 | 0; //@line 12786
  HEAP32[$105 >> 2] = $38; //@line 12787
  sp = STACKTOP; //@line 12788
  STACKTOP = sp; //@line 12789
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 12792
 ___async_unwind = 0; //@line 12793
 HEAP32[$ReallocAsyncCtx7 >> 2] = 87; //@line 12794
 $87 = $ReallocAsyncCtx7 + 4 | 0; //@line 12795
 HEAP32[$87 >> 2] = $2; //@line 12796
 $88 = $ReallocAsyncCtx7 + 8 | 0; //@line 12797
 HEAP32[$88 >> 2] = $4; //@line 12798
 $89 = $ReallocAsyncCtx7 + 12 | 0; //@line 12799
 HEAP32[$89 >> 2] = $6; //@line 12800
 $90 = $ReallocAsyncCtx7 + 16 | 0; //@line 12801
 HEAP8[$90 >> 0] = $8; //@line 12802
 $91 = $ReallocAsyncCtx7 + 20 | 0; //@line 12803
 HEAP32[$91 >> 2] = $10; //@line 12804
 $92 = $ReallocAsyncCtx7 + 24 | 0; //@line 12805
 HEAP32[$92 >> 2] = $12; //@line 12806
 $93 = $ReallocAsyncCtx7 + 28 | 0; //@line 12807
 HEAP32[$93 >> 2] = $14; //@line 12808
 $94 = $ReallocAsyncCtx7 + 32 | 0; //@line 12809
 HEAP32[$94 >> 2] = $16; //@line 12810
 $95 = $ReallocAsyncCtx7 + 36 | 0; //@line 12811
 HEAP32[$95 >> 2] = $18; //@line 12812
 $96 = $ReallocAsyncCtx7 + 40 | 0; //@line 12813
 HEAP32[$96 >> 2] = $20; //@line 12814
 $97 = $ReallocAsyncCtx7 + 44 | 0; //@line 12815
 HEAP32[$97 >> 2] = $22; //@line 12816
 $98 = $ReallocAsyncCtx7 + 48 | 0; //@line 12817
 HEAP32[$98 >> 2] = $24; //@line 12818
 $99 = $ReallocAsyncCtx7 + 52 | 0; //@line 12819
 HEAP32[$99 >> 2] = $26; //@line 12820
 $100 = $ReallocAsyncCtx7 + 56 | 0; //@line 12821
 HEAP32[$100 >> 2] = $28; //@line 12822
 $101 = $ReallocAsyncCtx7 + 60 | 0; //@line 12823
 HEAP32[$101 >> 2] = $30; //@line 12824
 $102 = $ReallocAsyncCtx7 + 64 | 0; //@line 12825
 HEAP32[$102 >> 2] = $32; //@line 12826
 $103 = $ReallocAsyncCtx7 + 68 | 0; //@line 12827
 HEAP32[$103 >> 2] = $34; //@line 12828
 $104 = $ReallocAsyncCtx7 + 72 | 0; //@line 12829
 HEAP32[$104 >> 2] = $36; //@line 12830
 $105 = $ReallocAsyncCtx7 + 76 | 0; //@line 12831
 HEAP32[$105 >> 2] = $38; //@line 12832
 sp = STACKTOP; //@line 12833
 STACKTOP = sp; //@line 12834
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_31($0) {
 $0 = $0 | 0;
 var $$019$i$1 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx5 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 294
 STACKTOP = STACKTOP + 32 | 0; //@line 295
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 295
 $$byval_copy = sp; //@line 296
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 298
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 300
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 302
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 304
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 306
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 308
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 310
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 312
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 314
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 316
 $22 = HEAP8[$0 + 44 >> 0] | 0; //@line 318
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 320
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 322
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 324
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 326
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 328
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 330
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 332
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 334
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(80) | 0; //@line 339
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($18, 0, $2, 512) | 0; //@line 340
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 80; //@line 343
   $42 = $ReallocAsyncCtx5 + 4 | 0; //@line 344
   HEAP32[$42 >> 2] = $2; //@line 345
   $43 = $ReallocAsyncCtx5 + 8 | 0; //@line 346
   HEAP32[$43 >> 2] = $4; //@line 347
   $44 = $ReallocAsyncCtx5 + 12 | 0; //@line 348
   HEAP32[$44 >> 2] = $6; //@line 349
   $45 = $ReallocAsyncCtx5 + 16 | 0; //@line 350
   HEAP32[$45 >> 2] = $8; //@line 351
   $46 = $ReallocAsyncCtx5 + 20 | 0; //@line 352
   HEAP32[$46 >> 2] = $10; //@line 353
   $47 = $ReallocAsyncCtx5 + 24 | 0; //@line 354
   HEAP32[$47 >> 2] = $12; //@line 355
   $48 = $ReallocAsyncCtx5 + 28 | 0; //@line 356
   HEAP32[$48 >> 2] = $14; //@line 357
   $49 = $ReallocAsyncCtx5 + 32 | 0; //@line 358
   HEAP32[$49 >> 2] = $16; //@line 359
   $50 = $ReallocAsyncCtx5 + 36 | 0; //@line 360
   HEAP32[$50 >> 2] = $18; //@line 361
   $51 = $ReallocAsyncCtx5 + 40 | 0; //@line 362
   HEAP32[$51 >> 2] = $20; //@line 363
   $52 = $ReallocAsyncCtx5 + 44 | 0; //@line 364
   HEAP8[$52 >> 0] = $22; //@line 365
   $53 = $ReallocAsyncCtx5 + 48 | 0; //@line 366
   HEAP32[$53 >> 2] = $24; //@line 367
   $54 = $ReallocAsyncCtx5 + 52 | 0; //@line 368
   HEAP32[$54 >> 2] = $26; //@line 369
   $55 = $ReallocAsyncCtx5 + 56 | 0; //@line 370
   HEAP32[$55 >> 2] = $28; //@line 371
   $56 = $ReallocAsyncCtx5 + 60 | 0; //@line 372
   HEAP32[$56 >> 2] = $30; //@line 373
   $57 = $ReallocAsyncCtx5 + 64 | 0; //@line 374
   HEAP32[$57 >> 2] = $32; //@line 375
   $58 = $ReallocAsyncCtx5 + 68 | 0; //@line 376
   HEAP32[$58 >> 2] = $34; //@line 377
   $59 = $ReallocAsyncCtx5 + 72 | 0; //@line 378
   HEAP32[$59 >> 2] = $36; //@line 379
   $60 = $ReallocAsyncCtx5 + 76 | 0; //@line 380
   HEAP32[$60 >> 2] = $38; //@line 381
   sp = STACKTOP; //@line 382
   STACKTOP = sp; //@line 383
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 386
  ___async_unwind = 0; //@line 387
  HEAP32[$ReallocAsyncCtx5 >> 2] = 80; //@line 388
  $42 = $ReallocAsyncCtx5 + 4 | 0; //@line 389
  HEAP32[$42 >> 2] = $2; //@line 390
  $43 = $ReallocAsyncCtx5 + 8 | 0; //@line 391
  HEAP32[$43 >> 2] = $4; //@line 392
  $44 = $ReallocAsyncCtx5 + 12 | 0; //@line 393
  HEAP32[$44 >> 2] = $6; //@line 394
  $45 = $ReallocAsyncCtx5 + 16 | 0; //@line 395
  HEAP32[$45 >> 2] = $8; //@line 396
  $46 = $ReallocAsyncCtx5 + 20 | 0; //@line 397
  HEAP32[$46 >> 2] = $10; //@line 398
  $47 = $ReallocAsyncCtx5 + 24 | 0; //@line 399
  HEAP32[$47 >> 2] = $12; //@line 400
  $48 = $ReallocAsyncCtx5 + 28 | 0; //@line 401
  HEAP32[$48 >> 2] = $14; //@line 402
  $49 = $ReallocAsyncCtx5 + 32 | 0; //@line 403
  HEAP32[$49 >> 2] = $16; //@line 404
  $50 = $ReallocAsyncCtx5 + 36 | 0; //@line 405
  HEAP32[$50 >> 2] = $18; //@line 406
  $51 = $ReallocAsyncCtx5 + 40 | 0; //@line 407
  HEAP32[$51 >> 2] = $20; //@line 408
  $52 = $ReallocAsyncCtx5 + 44 | 0; //@line 409
  HEAP8[$52 >> 0] = $22; //@line 410
  $53 = $ReallocAsyncCtx5 + 48 | 0; //@line 411
  HEAP32[$53 >> 2] = $24; //@line 412
  $54 = $ReallocAsyncCtx5 + 52 | 0; //@line 413
  HEAP32[$54 >> 2] = $26; //@line 414
  $55 = $ReallocAsyncCtx5 + 56 | 0; //@line 415
  HEAP32[$55 >> 2] = $28; //@line 416
  $56 = $ReallocAsyncCtx5 + 60 | 0; //@line 417
  HEAP32[$56 >> 2] = $30; //@line 418
  $57 = $ReallocAsyncCtx5 + 64 | 0; //@line 419
  HEAP32[$57 >> 2] = $32; //@line 420
  $58 = $ReallocAsyncCtx5 + 68 | 0; //@line 421
  HEAP32[$58 >> 2] = $34; //@line 422
  $59 = $ReallocAsyncCtx5 + 72 | 0; //@line 423
  HEAP32[$59 >> 2] = $36; //@line 424
  $60 = $ReallocAsyncCtx5 + 76 | 0; //@line 425
  HEAP32[$60 >> 2] = $38; //@line 426
  sp = STACKTOP; //@line 427
  STACKTOP = sp; //@line 428
  return;
 }
 HEAP8[$2 >> 0] = 0; //@line 430
 HEAP8[$4 >> 0] = 1; //@line 431
 HEAP8[$6 >> 0] = 1; //@line 432
 HEAP8[$8 >> 0] = 0; //@line 433
 HEAP8[$10 >> 0] = 0; //@line 434
 HEAP8[$12 >> 0] = 1; //@line 435
 HEAP8[$14 >> 0] = 0; //@line 436
 HEAP8[$14 + 1 >> 0] = 0; //@line 436
 HEAP8[$14 + 2 >> 0] = 0; //@line 436
 HEAP8[$14 + 3 >> 0] = 0; //@line 436
 HEAP8[$14 + 4 >> 0] = 0; //@line 436
 HEAP8[$14 + 5 >> 0] = 0; //@line 436
 if (!(HEAP8[$16 >> 0] | 0)) {
  $79 = $20; //@line 440
 } else {
  $$019$i$1 = $16; //@line 442
  $67 = $20; //@line 442
  while (1) {
   $64 = _strcspn($$019$i$1, 3461) | 0; //@line 444
   $66 = $67 + 1 | 0; //@line 446
   HEAP8[$67 >> 0] = $64; //@line 447
   $68 = $64 & 255; //@line 448
   _memcpy($66 | 0, $$019$i$1 | 0, $68 | 0) | 0; //@line 449
   $69 = $66 + $68 | 0; //@line 450
   $$019$i$1 = $$019$i$1 + ($64 + ((HEAP8[$$019$i$1 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 456
   if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
    $79 = $69; //@line 460
    break;
   } else {
    $67 = $69; //@line 463
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 468
 HEAP8[$79 + 1 >> 0] = 0; //@line 470
 HEAP8[$79 + 2 >> 0] = $22; //@line 472
 HEAP8[$79 + 3 >> 0] = 0; //@line 474
 HEAP8[$79 + 4 >> 0] = 1; //@line 475
 HEAP32[$$byval_copy >> 2] = HEAP32[119]; //@line 476
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[120]; //@line 476
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[121]; //@line 476
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[122]; //@line 476
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[123]; //@line 476
 __ZN13SocketAddressC2E10nsapi_addrt($26, $$byval_copy, 53); //@line 477
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(80) | 0; //@line 481
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($18, $26, $2, $79 + 5 - $28 | 0) | 0; //@line 482
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 485
  $87 = $ReallocAsyncCtx9 + 4 | 0; //@line 486
  HEAP32[$87 >> 2] = $18; //@line 487
  $88 = $ReallocAsyncCtx9 + 8 | 0; //@line 488
  HEAP32[$88 >> 2] = $2; //@line 489
  $89 = $ReallocAsyncCtx9 + 12 | 0; //@line 490
  HEAP32[$89 >> 2] = $20; //@line 491
  $90 = $ReallocAsyncCtx9 + 16 | 0; //@line 492
  HEAP8[$90 >> 0] = $22; //@line 493
  $91 = $ReallocAsyncCtx9 + 20 | 0; //@line 494
  HEAP32[$91 >> 2] = $24; //@line 495
  $92 = $ReallocAsyncCtx9 + 24 | 0; //@line 496
  HEAP32[$92 >> 2] = $26; //@line 497
  $93 = $ReallocAsyncCtx9 + 28 | 0; //@line 498
  HEAP32[$93 >> 2] = $28; //@line 499
  $94 = $ReallocAsyncCtx9 + 32 | 0; //@line 500
  HEAP32[$94 >> 2] = $30; //@line 501
  $95 = $ReallocAsyncCtx9 + 36 | 0; //@line 502
  HEAP32[$95 >> 2] = $4; //@line 503
  $96 = $ReallocAsyncCtx9 + 40 | 0; //@line 504
  HEAP32[$96 >> 2] = $6; //@line 505
  $97 = $ReallocAsyncCtx9 + 44 | 0; //@line 506
  HEAP32[$97 >> 2] = $8; //@line 507
  $98 = $ReallocAsyncCtx9 + 48 | 0; //@line 508
  HEAP32[$98 >> 2] = $10; //@line 509
  $99 = $ReallocAsyncCtx9 + 52 | 0; //@line 510
  HEAP32[$99 >> 2] = $12; //@line 511
  $100 = $ReallocAsyncCtx9 + 56 | 0; //@line 512
  HEAP32[$100 >> 2] = $14; //@line 513
  $101 = $ReallocAsyncCtx9 + 60 | 0; //@line 514
  HEAP32[$101 >> 2] = $16; //@line 515
  $102 = $ReallocAsyncCtx9 + 64 | 0; //@line 516
  HEAP32[$102 >> 2] = $32; //@line 517
  $103 = $ReallocAsyncCtx9 + 68 | 0; //@line 518
  HEAP32[$103 >> 2] = $34; //@line 519
  $104 = $ReallocAsyncCtx9 + 72 | 0; //@line 520
  HEAP32[$104 >> 2] = $36; //@line 521
  $105 = $ReallocAsyncCtx9 + 76 | 0; //@line 522
  HEAP32[$105 >> 2] = $38; //@line 523
  sp = STACKTOP; //@line 524
  STACKTOP = sp; //@line 525
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 528
 ___async_unwind = 0; //@line 529
 HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 530
 $87 = $ReallocAsyncCtx9 + 4 | 0; //@line 531
 HEAP32[$87 >> 2] = $18; //@line 532
 $88 = $ReallocAsyncCtx9 + 8 | 0; //@line 533
 HEAP32[$88 >> 2] = $2; //@line 534
 $89 = $ReallocAsyncCtx9 + 12 | 0; //@line 535
 HEAP32[$89 >> 2] = $20; //@line 536
 $90 = $ReallocAsyncCtx9 + 16 | 0; //@line 537
 HEAP8[$90 >> 0] = $22; //@line 538
 $91 = $ReallocAsyncCtx9 + 20 | 0; //@line 539
 HEAP32[$91 >> 2] = $24; //@line 540
 $92 = $ReallocAsyncCtx9 + 24 | 0; //@line 541
 HEAP32[$92 >> 2] = $26; //@line 542
 $93 = $ReallocAsyncCtx9 + 28 | 0; //@line 543
 HEAP32[$93 >> 2] = $28; //@line 544
 $94 = $ReallocAsyncCtx9 + 32 | 0; //@line 545
 HEAP32[$94 >> 2] = $30; //@line 546
 $95 = $ReallocAsyncCtx9 + 36 | 0; //@line 547
 HEAP32[$95 >> 2] = $4; //@line 548
 $96 = $ReallocAsyncCtx9 + 40 | 0; //@line 549
 HEAP32[$96 >> 2] = $6; //@line 550
 $97 = $ReallocAsyncCtx9 + 44 | 0; //@line 551
 HEAP32[$97 >> 2] = $8; //@line 552
 $98 = $ReallocAsyncCtx9 + 48 | 0; //@line 553
 HEAP32[$98 >> 2] = $10; //@line 554
 $99 = $ReallocAsyncCtx9 + 52 | 0; //@line 555
 HEAP32[$99 >> 2] = $12; //@line 556
 $100 = $ReallocAsyncCtx9 + 56 | 0; //@line 557
 HEAP32[$100 >> 2] = $14; //@line 558
 $101 = $ReallocAsyncCtx9 + 60 | 0; //@line 559
 HEAP32[$101 >> 2] = $16; //@line 560
 $102 = $ReallocAsyncCtx9 + 64 | 0; //@line 561
 HEAP32[$102 >> 2] = $32; //@line 562
 $103 = $ReallocAsyncCtx9 + 68 | 0; //@line 563
 HEAP32[$103 >> 2] = $34; //@line 564
 $104 = $ReallocAsyncCtx9 + 72 | 0; //@line 565
 HEAP32[$104 >> 2] = $36; //@line 566
 $105 = $ReallocAsyncCtx9 + 76 | 0; //@line 567
 HEAP32[$105 >> 2] = $38; //@line 568
 sp = STACKTOP; //@line 569
 STACKTOP = sp; //@line 570
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_30($0) {
 $0 = $0 | 0;
 var $$019$i$2 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8
 STACKTOP = STACKTOP + 32 | 0; //@line 9
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 9
 $$byval_copy = sp; //@line 10
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 16
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 18
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 20
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 22
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 24
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 26
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 28
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 30
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 32
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 34
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 36
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 38
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 40
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 42
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 44
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 46
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 48
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(80) | 0; //@line 53
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($2, 0, $4, 512) | 0; //@line 54
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 57
   $42 = $ReallocAsyncCtx4 + 4 | 0; //@line 58
   HEAP32[$42 >> 2] = $2; //@line 59
   $43 = $ReallocAsyncCtx4 + 8 | 0; //@line 60
   HEAP32[$43 >> 2] = $4; //@line 61
   $44 = $ReallocAsyncCtx4 + 12 | 0; //@line 62
   HEAP32[$44 >> 2] = $6; //@line 63
   $45 = $ReallocAsyncCtx4 + 16 | 0; //@line 64
   HEAP8[$45 >> 0] = $8; //@line 65
   $46 = $ReallocAsyncCtx4 + 20 | 0; //@line 66
   HEAP32[$46 >> 2] = $10; //@line 67
   $47 = $ReallocAsyncCtx4 + 24 | 0; //@line 68
   HEAP32[$47 >> 2] = $12; //@line 69
   $48 = $ReallocAsyncCtx4 + 28 | 0; //@line 70
   HEAP32[$48 >> 2] = $14; //@line 71
   $49 = $ReallocAsyncCtx4 + 32 | 0; //@line 72
   HEAP32[$49 >> 2] = $16; //@line 73
   $50 = $ReallocAsyncCtx4 + 36 | 0; //@line 74
   HEAP32[$50 >> 2] = $18; //@line 75
   $51 = $ReallocAsyncCtx4 + 40 | 0; //@line 76
   HEAP32[$51 >> 2] = $20; //@line 77
   $52 = $ReallocAsyncCtx4 + 44 | 0; //@line 78
   HEAP32[$52 >> 2] = $22; //@line 79
   $53 = $ReallocAsyncCtx4 + 48 | 0; //@line 80
   HEAP32[$53 >> 2] = $24; //@line 81
   $54 = $ReallocAsyncCtx4 + 52 | 0; //@line 82
   HEAP32[$54 >> 2] = $26; //@line 83
   $55 = $ReallocAsyncCtx4 + 56 | 0; //@line 84
   HEAP32[$55 >> 2] = $28; //@line 85
   $56 = $ReallocAsyncCtx4 + 60 | 0; //@line 86
   HEAP32[$56 >> 2] = $30; //@line 87
   $57 = $ReallocAsyncCtx4 + 64 | 0; //@line 88
   HEAP32[$57 >> 2] = $32; //@line 89
   $58 = $ReallocAsyncCtx4 + 68 | 0; //@line 90
   HEAP32[$58 >> 2] = $34; //@line 91
   $59 = $ReallocAsyncCtx4 + 72 | 0; //@line 92
   HEAP32[$59 >> 2] = $36; //@line 93
   $60 = $ReallocAsyncCtx4 + 76 | 0; //@line 94
   HEAP32[$60 >> 2] = $38; //@line 95
   sp = STACKTOP; //@line 96
   STACKTOP = sp; //@line 97
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 100
  ___async_unwind = 0; //@line 101
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 102
  $42 = $ReallocAsyncCtx4 + 4 | 0; //@line 103
  HEAP32[$42 >> 2] = $2; //@line 104
  $43 = $ReallocAsyncCtx4 + 8 | 0; //@line 105
  HEAP32[$43 >> 2] = $4; //@line 106
  $44 = $ReallocAsyncCtx4 + 12 | 0; //@line 107
  HEAP32[$44 >> 2] = $6; //@line 108
  $45 = $ReallocAsyncCtx4 + 16 | 0; //@line 109
  HEAP8[$45 >> 0] = $8; //@line 110
  $46 = $ReallocAsyncCtx4 + 20 | 0; //@line 111
  HEAP32[$46 >> 2] = $10; //@line 112
  $47 = $ReallocAsyncCtx4 + 24 | 0; //@line 113
  HEAP32[$47 >> 2] = $12; //@line 114
  $48 = $ReallocAsyncCtx4 + 28 | 0; //@line 115
  HEAP32[$48 >> 2] = $14; //@line 116
  $49 = $ReallocAsyncCtx4 + 32 | 0; //@line 117
  HEAP32[$49 >> 2] = $16; //@line 118
  $50 = $ReallocAsyncCtx4 + 36 | 0; //@line 119
  HEAP32[$50 >> 2] = $18; //@line 120
  $51 = $ReallocAsyncCtx4 + 40 | 0; //@line 121
  HEAP32[$51 >> 2] = $20; //@line 122
  $52 = $ReallocAsyncCtx4 + 44 | 0; //@line 123
  HEAP32[$52 >> 2] = $22; //@line 124
  $53 = $ReallocAsyncCtx4 + 48 | 0; //@line 125
  HEAP32[$53 >> 2] = $24; //@line 126
  $54 = $ReallocAsyncCtx4 + 52 | 0; //@line 127
  HEAP32[$54 >> 2] = $26; //@line 128
  $55 = $ReallocAsyncCtx4 + 56 | 0; //@line 129
  HEAP32[$55 >> 2] = $28; //@line 130
  $56 = $ReallocAsyncCtx4 + 60 | 0; //@line 131
  HEAP32[$56 >> 2] = $30; //@line 132
  $57 = $ReallocAsyncCtx4 + 64 | 0; //@line 133
  HEAP32[$57 >> 2] = $32; //@line 134
  $58 = $ReallocAsyncCtx4 + 68 | 0; //@line 135
  HEAP32[$58 >> 2] = $34; //@line 136
  $59 = $ReallocAsyncCtx4 + 72 | 0; //@line 137
  HEAP32[$59 >> 2] = $36; //@line 138
  $60 = $ReallocAsyncCtx4 + 76 | 0; //@line 139
  HEAP32[$60 >> 2] = $38; //@line 140
  sp = STACKTOP; //@line 141
  STACKTOP = sp; //@line 142
  return;
 }
 HEAP8[$4 >> 0] = 0; //@line 144
 HEAP8[$18 >> 0] = 1; //@line 145
 HEAP8[$20 >> 0] = 1; //@line 146
 HEAP8[$22 >> 0] = 0; //@line 147
 HEAP8[$24 >> 0] = 0; //@line 148
 HEAP8[$26 >> 0] = 1; //@line 149
 HEAP8[$28 >> 0] = 0; //@line 150
 HEAP8[$28 + 1 >> 0] = 0; //@line 150
 HEAP8[$28 + 2 >> 0] = 0; //@line 150
 HEAP8[$28 + 3 >> 0] = 0; //@line 150
 HEAP8[$28 + 4 >> 0] = 0; //@line 150
 HEAP8[$28 + 5 >> 0] = 0; //@line 150
 if (!(HEAP8[$30 >> 0] | 0)) {
  $79 = $6; //@line 154
 } else {
  $$019$i$2 = $30; //@line 156
  $67 = $6; //@line 156
  while (1) {
   $64 = _strcspn($$019$i$2, 3461) | 0; //@line 158
   $66 = $67 + 1 | 0; //@line 160
   HEAP8[$67 >> 0] = $64; //@line 161
   $68 = $64 & 255; //@line 162
   _memcpy($66 | 0, $$019$i$2 | 0, $68 | 0) | 0; //@line 163
   $69 = $66 + $68 | 0; //@line 164
   $$019$i$2 = $$019$i$2 + ($64 + ((HEAP8[$$019$i$2 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 170
   if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
    $79 = $69; //@line 174
    break;
   } else {
    $67 = $69; //@line 177
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 182
 HEAP8[$79 + 1 >> 0] = 0; //@line 184
 HEAP8[$79 + 2 >> 0] = $8; //@line 186
 HEAP8[$79 + 3 >> 0] = 0; //@line 188
 HEAP8[$79 + 4 >> 0] = 1; //@line 189
 HEAP32[$$byval_copy >> 2] = HEAP32[124]; //@line 190
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[125]; //@line 190
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[126]; //@line 190
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[127]; //@line 190
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[128]; //@line 190
 __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 191
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(80) | 0; //@line 195
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $79 + 5 - $14 | 0) | 0; //@line 196
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 85; //@line 199
  $87 = $ReallocAsyncCtx8 + 4 | 0; //@line 200
  HEAP32[$87 >> 2] = $2; //@line 201
  $88 = $ReallocAsyncCtx8 + 8 | 0; //@line 202
  HEAP32[$88 >> 2] = $4; //@line 203
  $89 = $ReallocAsyncCtx8 + 12 | 0; //@line 204
  HEAP32[$89 >> 2] = $6; //@line 205
  $90 = $ReallocAsyncCtx8 + 16 | 0; //@line 206
  HEAP8[$90 >> 0] = $8; //@line 207
  $91 = $ReallocAsyncCtx8 + 20 | 0; //@line 208
  HEAP32[$91 >> 2] = $10; //@line 209
  $92 = $ReallocAsyncCtx8 + 24 | 0; //@line 210
  HEAP32[$92 >> 2] = $12; //@line 211
  $93 = $ReallocAsyncCtx8 + 28 | 0; //@line 212
  HEAP32[$93 >> 2] = $14; //@line 213
  $94 = $ReallocAsyncCtx8 + 32 | 0; //@line 214
  HEAP32[$94 >> 2] = $16; //@line 215
  $95 = $ReallocAsyncCtx8 + 36 | 0; //@line 216
  HEAP32[$95 >> 2] = $32; //@line 217
  $96 = $ReallocAsyncCtx8 + 40 | 0; //@line 218
  HEAP32[$96 >> 2] = $18; //@line 219
  $97 = $ReallocAsyncCtx8 + 44 | 0; //@line 220
  HEAP32[$97 >> 2] = $20; //@line 221
  $98 = $ReallocAsyncCtx8 + 48 | 0; //@line 222
  HEAP32[$98 >> 2] = $22; //@line 223
  $99 = $ReallocAsyncCtx8 + 52 | 0; //@line 224
  HEAP32[$99 >> 2] = $24; //@line 225
  $100 = $ReallocAsyncCtx8 + 56 | 0; //@line 226
  HEAP32[$100 >> 2] = $26; //@line 227
  $101 = $ReallocAsyncCtx8 + 60 | 0; //@line 228
  HEAP32[$101 >> 2] = $28; //@line 229
  $102 = $ReallocAsyncCtx8 + 64 | 0; //@line 230
  HEAP32[$102 >> 2] = $34; //@line 231
  $103 = $ReallocAsyncCtx8 + 68 | 0; //@line 232
  HEAP32[$103 >> 2] = $36; //@line 233
  $104 = $ReallocAsyncCtx8 + 72 | 0; //@line 234
  HEAP32[$104 >> 2] = $38; //@line 235
  $105 = $ReallocAsyncCtx8 + 76 | 0; //@line 236
  HEAP32[$105 >> 2] = $30; //@line 237
  sp = STACKTOP; //@line 238
  STACKTOP = sp; //@line 239
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 242
 ___async_unwind = 0; //@line 243
 HEAP32[$ReallocAsyncCtx8 >> 2] = 85; //@line 244
 $87 = $ReallocAsyncCtx8 + 4 | 0; //@line 245
 HEAP32[$87 >> 2] = $2; //@line 246
 $88 = $ReallocAsyncCtx8 + 8 | 0; //@line 247
 HEAP32[$88 >> 2] = $4; //@line 248
 $89 = $ReallocAsyncCtx8 + 12 | 0; //@line 249
 HEAP32[$89 >> 2] = $6; //@line 250
 $90 = $ReallocAsyncCtx8 + 16 | 0; //@line 251
 HEAP8[$90 >> 0] = $8; //@line 252
 $91 = $ReallocAsyncCtx8 + 20 | 0; //@line 253
 HEAP32[$91 >> 2] = $10; //@line 254
 $92 = $ReallocAsyncCtx8 + 24 | 0; //@line 255
 HEAP32[$92 >> 2] = $12; //@line 256
 $93 = $ReallocAsyncCtx8 + 28 | 0; //@line 257
 HEAP32[$93 >> 2] = $14; //@line 258
 $94 = $ReallocAsyncCtx8 + 32 | 0; //@line 259
 HEAP32[$94 >> 2] = $16; //@line 260
 $95 = $ReallocAsyncCtx8 + 36 | 0; //@line 261
 HEAP32[$95 >> 2] = $32; //@line 262
 $96 = $ReallocAsyncCtx8 + 40 | 0; //@line 263
 HEAP32[$96 >> 2] = $18; //@line 264
 $97 = $ReallocAsyncCtx8 + 44 | 0; //@line 265
 HEAP32[$97 >> 2] = $20; //@line 266
 $98 = $ReallocAsyncCtx8 + 48 | 0; //@line 267
 HEAP32[$98 >> 2] = $22; //@line 268
 $99 = $ReallocAsyncCtx8 + 52 | 0; //@line 269
 HEAP32[$99 >> 2] = $24; //@line 270
 $100 = $ReallocAsyncCtx8 + 56 | 0; //@line 271
 HEAP32[$100 >> 2] = $26; //@line 272
 $101 = $ReallocAsyncCtx8 + 60 | 0; //@line 273
 HEAP32[$101 >> 2] = $28; //@line 274
 $102 = $ReallocAsyncCtx8 + 64 | 0; //@line 275
 HEAP32[$102 >> 2] = $34; //@line 276
 $103 = $ReallocAsyncCtx8 + 68 | 0; //@line 277
 HEAP32[$103 >> 2] = $36; //@line 278
 $104 = $ReallocAsyncCtx8 + 72 | 0; //@line 279
 HEAP32[$104 >> 2] = $38; //@line 280
 $105 = $ReallocAsyncCtx8 + 76 | 0; //@line 281
 HEAP32[$105 >> 2] = $30; //@line 282
 sp = STACKTOP; //@line 283
 STACKTOP = sp; //@line 284
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_28($0) {
 $0 = $0 | 0;
 var $$019$i$4 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12288
 STACKTOP = STACKTOP + 32 | 0; //@line 12289
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 12289
 $$byval_copy = sp; //@line 12290
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12292
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12294
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12296
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12298
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12300
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12302
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12304
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12306
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12308
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12310
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12312
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12314
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12316
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12318
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12320
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12322
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12324
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12326
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12328
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(80) | 0; //@line 12333
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($2, 0, $4, 512) | 0; //@line 12334
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 88; //@line 12337
   $42 = $ReallocAsyncCtx2 + 4 | 0; //@line 12338
   HEAP32[$42 >> 2] = $2; //@line 12339
   $43 = $ReallocAsyncCtx2 + 8 | 0; //@line 12340
   HEAP32[$43 >> 2] = $4; //@line 12341
   $44 = $ReallocAsyncCtx2 + 12 | 0; //@line 12342
   HEAP32[$44 >> 2] = $6; //@line 12343
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 12344
   HEAP8[$45 >> 0] = $8; //@line 12345
   $46 = $ReallocAsyncCtx2 + 20 | 0; //@line 12346
   HEAP32[$46 >> 2] = $10; //@line 12347
   $47 = $ReallocAsyncCtx2 + 24 | 0; //@line 12348
   HEAP32[$47 >> 2] = $12; //@line 12349
   $48 = $ReallocAsyncCtx2 + 28 | 0; //@line 12350
   HEAP32[$48 >> 2] = $14; //@line 12351
   $49 = $ReallocAsyncCtx2 + 32 | 0; //@line 12352
   HEAP32[$49 >> 2] = $16; //@line 12353
   $50 = $ReallocAsyncCtx2 + 36 | 0; //@line 12354
   HEAP32[$50 >> 2] = $20; //@line 12355
   $51 = $ReallocAsyncCtx2 + 40 | 0; //@line 12356
   HEAP32[$51 >> 2] = $22; //@line 12357
   $52 = $ReallocAsyncCtx2 + 44 | 0; //@line 12358
   HEAP32[$52 >> 2] = $24; //@line 12359
   $53 = $ReallocAsyncCtx2 + 48 | 0; //@line 12360
   HEAP32[$53 >> 2] = $26; //@line 12361
   $54 = $ReallocAsyncCtx2 + 52 | 0; //@line 12362
   HEAP32[$54 >> 2] = $28; //@line 12363
   $55 = $ReallocAsyncCtx2 + 56 | 0; //@line 12364
   HEAP32[$55 >> 2] = $30; //@line 12365
   $56 = $ReallocAsyncCtx2 + 60 | 0; //@line 12366
   HEAP32[$56 >> 2] = $38; //@line 12367
   $57 = $ReallocAsyncCtx2 + 64 | 0; //@line 12368
   HEAP32[$57 >> 2] = $18; //@line 12369
   $58 = $ReallocAsyncCtx2 + 68 | 0; //@line 12370
   HEAP32[$58 >> 2] = $32; //@line 12371
   $59 = $ReallocAsyncCtx2 + 72 | 0; //@line 12372
   HEAP32[$59 >> 2] = $34; //@line 12373
   $60 = $ReallocAsyncCtx2 + 76 | 0; //@line 12374
   HEAP32[$60 >> 2] = $36; //@line 12375
   sp = STACKTOP; //@line 12376
   STACKTOP = sp; //@line 12377
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 12380
  ___async_unwind = 0; //@line 12381
  HEAP32[$ReallocAsyncCtx2 >> 2] = 88; //@line 12382
  $42 = $ReallocAsyncCtx2 + 4 | 0; //@line 12383
  HEAP32[$42 >> 2] = $2; //@line 12384
  $43 = $ReallocAsyncCtx2 + 8 | 0; //@line 12385
  HEAP32[$43 >> 2] = $4; //@line 12386
  $44 = $ReallocAsyncCtx2 + 12 | 0; //@line 12387
  HEAP32[$44 >> 2] = $6; //@line 12388
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 12389
  HEAP8[$45 >> 0] = $8; //@line 12390
  $46 = $ReallocAsyncCtx2 + 20 | 0; //@line 12391
  HEAP32[$46 >> 2] = $10; //@line 12392
  $47 = $ReallocAsyncCtx2 + 24 | 0; //@line 12393
  HEAP32[$47 >> 2] = $12; //@line 12394
  $48 = $ReallocAsyncCtx2 + 28 | 0; //@line 12395
  HEAP32[$48 >> 2] = $14; //@line 12396
  $49 = $ReallocAsyncCtx2 + 32 | 0; //@line 12397
  HEAP32[$49 >> 2] = $16; //@line 12398
  $50 = $ReallocAsyncCtx2 + 36 | 0; //@line 12399
  HEAP32[$50 >> 2] = $20; //@line 12400
  $51 = $ReallocAsyncCtx2 + 40 | 0; //@line 12401
  HEAP32[$51 >> 2] = $22; //@line 12402
  $52 = $ReallocAsyncCtx2 + 44 | 0; //@line 12403
  HEAP32[$52 >> 2] = $24; //@line 12404
  $53 = $ReallocAsyncCtx2 + 48 | 0; //@line 12405
  HEAP32[$53 >> 2] = $26; //@line 12406
  $54 = $ReallocAsyncCtx2 + 52 | 0; //@line 12407
  HEAP32[$54 >> 2] = $28; //@line 12408
  $55 = $ReallocAsyncCtx2 + 56 | 0; //@line 12409
  HEAP32[$55 >> 2] = $30; //@line 12410
  $56 = $ReallocAsyncCtx2 + 60 | 0; //@line 12411
  HEAP32[$56 >> 2] = $38; //@line 12412
  $57 = $ReallocAsyncCtx2 + 64 | 0; //@line 12413
  HEAP32[$57 >> 2] = $18; //@line 12414
  $58 = $ReallocAsyncCtx2 + 68 | 0; //@line 12415
  HEAP32[$58 >> 2] = $32; //@line 12416
  $59 = $ReallocAsyncCtx2 + 72 | 0; //@line 12417
  HEAP32[$59 >> 2] = $34; //@line 12418
  $60 = $ReallocAsyncCtx2 + 76 | 0; //@line 12419
  HEAP32[$60 >> 2] = $36; //@line 12420
  sp = STACKTOP; //@line 12421
  STACKTOP = sp; //@line 12422
  return;
 }
 HEAP8[$4 >> 0] = 0; //@line 12424
 HEAP8[$20 >> 0] = 1; //@line 12425
 HEAP8[$22 >> 0] = 1; //@line 12426
 HEAP8[$24 >> 0] = 0; //@line 12427
 HEAP8[$26 >> 0] = 0; //@line 12428
 HEAP8[$28 >> 0] = 1; //@line 12429
 HEAP8[$30 >> 0] = 0; //@line 12430
 HEAP8[$30 + 1 >> 0] = 0; //@line 12430
 HEAP8[$30 + 2 >> 0] = 0; //@line 12430
 HEAP8[$30 + 3 >> 0] = 0; //@line 12430
 HEAP8[$30 + 4 >> 0] = 0; //@line 12430
 HEAP8[$30 + 5 >> 0] = 0; //@line 12430
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $6; //@line 12434
 } else {
  $$019$i$4 = $38; //@line 12436
  $67 = $6; //@line 12436
  while (1) {
   $64 = _strcspn($$019$i$4, 3461) | 0; //@line 12438
   $66 = $67 + 1 | 0; //@line 12440
   HEAP8[$67 >> 0] = $64; //@line 12441
   $68 = $64 & 255; //@line 12442
   _memcpy($66 | 0, $$019$i$4 | 0, $68 | 0) | 0; //@line 12443
   $69 = $66 + $68 | 0; //@line 12444
   $$019$i$4 = $$019$i$4 + ($64 + ((HEAP8[$$019$i$4 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 12450
   if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
    $79 = $69; //@line 12454
    break;
   } else {
    $67 = $69; //@line 12457
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 12462
 HEAP8[$79 + 1 >> 0] = 0; //@line 12464
 HEAP8[$79 + 2 >> 0] = $8; //@line 12466
 HEAP8[$79 + 3 >> 0] = 0; //@line 12468
 HEAP8[$79 + 4 >> 0] = 1; //@line 12469
 HEAP32[$$byval_copy >> 2] = HEAP32[134]; //@line 12470
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[135]; //@line 12470
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[136]; //@line 12470
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[137]; //@line 12470
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[138]; //@line 12470
 __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 12471
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 12475
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($2, $12, $4, $79 + 5 - $14 | 0) | 0; //@line 12476
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 89; //@line 12479
  $87 = $ReallocAsyncCtx6 + 4 | 0; //@line 12480
  HEAP32[$87 >> 2] = $2; //@line 12481
  $88 = $ReallocAsyncCtx6 + 8 | 0; //@line 12482
  HEAP32[$88 >> 2] = $4; //@line 12483
  $89 = $ReallocAsyncCtx6 + 12 | 0; //@line 12484
  HEAP32[$89 >> 2] = $16; //@line 12485
  $90 = $ReallocAsyncCtx6 + 16 | 0; //@line 12486
  HEAP32[$90 >> 2] = $18; //@line 12487
  $91 = $ReallocAsyncCtx6 + 20 | 0; //@line 12488
  HEAP32[$91 >> 2] = $6; //@line 12489
  $92 = $ReallocAsyncCtx6 + 24 | 0; //@line 12490
  HEAP32[$92 >> 2] = $10; //@line 12491
  $93 = $ReallocAsyncCtx6 + 28 | 0; //@line 12492
  HEAP32[$93 >> 2] = $20; //@line 12493
  $94 = $ReallocAsyncCtx6 + 32 | 0; //@line 12494
  HEAP32[$94 >> 2] = $22; //@line 12495
  $95 = $ReallocAsyncCtx6 + 36 | 0; //@line 12496
  HEAP32[$95 >> 2] = $24; //@line 12497
  $96 = $ReallocAsyncCtx6 + 40 | 0; //@line 12498
  HEAP32[$96 >> 2] = $26; //@line 12499
  $97 = $ReallocAsyncCtx6 + 44 | 0; //@line 12500
  HEAP32[$97 >> 2] = $28; //@line 12501
  $98 = $ReallocAsyncCtx6 + 48 | 0; //@line 12502
  HEAP32[$98 >> 2] = $30; //@line 12503
  $99 = $ReallocAsyncCtx6 + 52 | 0; //@line 12504
  HEAP32[$99 >> 2] = $32; //@line 12505
  $100 = $ReallocAsyncCtx6 + 56 | 0; //@line 12506
  HEAP32[$100 >> 2] = $34; //@line 12507
  $101 = $ReallocAsyncCtx6 + 60 | 0; //@line 12508
  HEAP32[$101 >> 2] = $36; //@line 12509
  sp = STACKTOP; //@line 12510
  STACKTOP = sp; //@line 12511
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 12514
 ___async_unwind = 0; //@line 12515
 HEAP32[$ReallocAsyncCtx6 >> 2] = 89; //@line 12516
 $87 = $ReallocAsyncCtx6 + 4 | 0; //@line 12517
 HEAP32[$87 >> 2] = $2; //@line 12518
 $88 = $ReallocAsyncCtx6 + 8 | 0; //@line 12519
 HEAP32[$88 >> 2] = $4; //@line 12520
 $89 = $ReallocAsyncCtx6 + 12 | 0; //@line 12521
 HEAP32[$89 >> 2] = $16; //@line 12522
 $90 = $ReallocAsyncCtx6 + 16 | 0; //@line 12523
 HEAP32[$90 >> 2] = $18; //@line 12524
 $91 = $ReallocAsyncCtx6 + 20 | 0; //@line 12525
 HEAP32[$91 >> 2] = $6; //@line 12526
 $92 = $ReallocAsyncCtx6 + 24 | 0; //@line 12527
 HEAP32[$92 >> 2] = $10; //@line 12528
 $93 = $ReallocAsyncCtx6 + 28 | 0; //@line 12529
 HEAP32[$93 >> 2] = $20; //@line 12530
 $94 = $ReallocAsyncCtx6 + 32 | 0; //@line 12531
 HEAP32[$94 >> 2] = $22; //@line 12532
 $95 = $ReallocAsyncCtx6 + 36 | 0; //@line 12533
 HEAP32[$95 >> 2] = $24; //@line 12534
 $96 = $ReallocAsyncCtx6 + 40 | 0; //@line 12535
 HEAP32[$96 >> 2] = $26; //@line 12536
 $97 = $ReallocAsyncCtx6 + 44 | 0; //@line 12537
 HEAP32[$97 >> 2] = $28; //@line 12538
 $98 = $ReallocAsyncCtx6 + 48 | 0; //@line 12539
 HEAP32[$98 >> 2] = $30; //@line 12540
 $99 = $ReallocAsyncCtx6 + 52 | 0; //@line 12541
 HEAP32[$99 >> 2] = $32; //@line 12542
 $100 = $ReallocAsyncCtx6 + 56 | 0; //@line 12543
 HEAP32[$100 >> 2] = $34; //@line 12544
 $101 = $ReallocAsyncCtx6 + 60 | 0; //@line 12545
 HEAP32[$101 >> 2] = $36; //@line 12546
 sp = STACKTOP; //@line 12547
 STACKTOP = sp; //@line 12548
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 4274
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 4275
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 4276
 $d_sroa_0_0_extract_trunc = $b$0; //@line 4277
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 4278
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 4279
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 4281
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 4284
    HEAP32[$rem + 4 >> 2] = 0; //@line 4285
   }
   $_0$1 = 0; //@line 4287
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 4288
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4289
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 4292
    $_0$0 = 0; //@line 4293
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4294
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 4296
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 4297
   $_0$1 = 0; //@line 4298
   $_0$0 = 0; //@line 4299
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4300
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 4303
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 4308
     HEAP32[$rem + 4 >> 2] = 0; //@line 4309
    }
    $_0$1 = 0; //@line 4311
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 4312
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4313
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 4317
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 4318
    }
    $_0$1 = 0; //@line 4320
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 4321
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4322
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 4324
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 4327
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 4328
    }
    $_0$1 = 0; //@line 4330
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 4331
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4332
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 4335
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 4337
    $58 = 31 - $51 | 0; //@line 4338
    $sr_1_ph = $57; //@line 4339
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 4340
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 4341
    $q_sroa_0_1_ph = 0; //@line 4342
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 4343
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 4347
    $_0$0 = 0; //@line 4348
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4349
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 4351
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 4352
   $_0$1 = 0; //@line 4353
   $_0$0 = 0; //@line 4354
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4355
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 4359
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 4361
     $126 = 31 - $119 | 0; //@line 4362
     $130 = $119 - 31 >> 31; //@line 4363
     $sr_1_ph = $125; //@line 4364
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 4365
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 4366
     $q_sroa_0_1_ph = 0; //@line 4367
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 4368
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 4372
     $_0$0 = 0; //@line 4373
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4374
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 4376
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 4377
    $_0$1 = 0; //@line 4378
    $_0$0 = 0; //@line 4379
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4380
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 4382
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 4385
    $89 = 64 - $88 | 0; //@line 4386
    $91 = 32 - $88 | 0; //@line 4387
    $92 = $91 >> 31; //@line 4388
    $95 = $88 - 32 | 0; //@line 4389
    $105 = $95 >> 31; //@line 4390
    $sr_1_ph = $88; //@line 4391
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 4392
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 4393
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 4394
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 4395
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 4399
    HEAP32[$rem + 4 >> 2] = 0; //@line 4400
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 4403
    $_0$0 = $a$0 | 0 | 0; //@line 4404
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4405
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 4407
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 4408
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 4409
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4410
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 4415
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 4416
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 4417
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 4418
  $carry_0_lcssa$1 = 0; //@line 4419
  $carry_0_lcssa$0 = 0; //@line 4420
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 4422
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 4423
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 4424
  $137$1 = tempRet0; //@line 4425
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 4426
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 4427
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 4428
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 4429
  $sr_1202 = $sr_1_ph; //@line 4430
  $carry_0203 = 0; //@line 4431
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 4433
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 4434
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 4435
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 4436
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 4437
   $150$1 = tempRet0; //@line 4438
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 4439
   $carry_0203 = $151$0 & 1; //@line 4440
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 4442
   $r_sroa_1_1200 = tempRet0; //@line 4443
   $sr_1202 = $sr_1202 - 1 | 0; //@line 4444
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 4456
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 4457
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 4458
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 4459
  $carry_0_lcssa$1 = 0; //@line 4460
  $carry_0_lcssa$0 = $carry_0203; //@line 4461
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 4463
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 4464
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 4467
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 4468
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 4470
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 4471
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4472
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7580
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7586
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7595
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7600
      $19 = $1 + 44 | 0; //@line 7601
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 7610
      $26 = $1 + 52 | 0; //@line 7611
      $27 = $1 + 53 | 0; //@line 7612
      $28 = $1 + 54 | 0; //@line 7613
      $29 = $0 + 8 | 0; //@line 7614
      $30 = $1 + 24 | 0; //@line 7615
      $$081$off0 = 0; //@line 7616
      $$084 = $0 + 16 | 0; //@line 7616
      $$085$off0 = 0; //@line 7616
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 7620
        label = 20; //@line 7621
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 7624
       HEAP8[$27 >> 0] = 0; //@line 7625
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 7626
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 7627
       if (___async) {
        label = 12; //@line 7630
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 7633
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 7637
        label = 20; //@line 7638
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 7645
         $$186$off0 = $$085$off0; //@line 7645
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 7654
           label = 20; //@line 7655
           break L10;
          } else {
           $$182$off0 = 1; //@line 7658
           $$186$off0 = $$085$off0; //@line 7658
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 7665
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 7672
          break L10;
         } else {
          $$182$off0 = 1; //@line 7675
          $$186$off0 = 1; //@line 7675
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 7680
       $$084 = $$084 + 8 | 0; //@line 7680
       $$085$off0 = $$186$off0; //@line 7680
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 163; //@line 7683
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 7685
       HEAP32[$AsyncCtx15 + 8 >> 2] = $28; //@line 7687
       HEAP32[$AsyncCtx15 + 12 >> 2] = $30; //@line 7689
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 7691
       HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 7693
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 7695
       HEAP8[$AsyncCtx15 + 28 >> 0] = $$081$off0 & 1; //@line 7698
       HEAP8[$AsyncCtx15 + 29 >> 0] = $$085$off0 & 1; //@line 7701
       HEAP32[$AsyncCtx15 + 32 >> 2] = $$084; //@line 7703
       HEAP32[$AsyncCtx15 + 36 >> 2] = $29; //@line 7705
       HEAP32[$AsyncCtx15 + 40 >> 2] = $26; //@line 7707
       HEAP32[$AsyncCtx15 + 44 >> 2] = $27; //@line 7709
       HEAP8[$AsyncCtx15 + 48 >> 0] = $4 & 1; //@line 7712
       HEAP32[$AsyncCtx15 + 52 >> 2] = $25; //@line 7714
       sp = STACKTOP; //@line 7715
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 7721
         $61 = $1 + 40 | 0; //@line 7722
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 7725
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 7733
           if ($$283$off0) {
            label = 25; //@line 7735
            break;
           } else {
            $69 = 4; //@line 7738
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 7745
        } else {
         $69 = 4; //@line 7747
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 7752
      }
      HEAP32[$19 >> 2] = $69; //@line 7754
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 7763
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 7768
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 7769
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 7770
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 7771
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 164; //@line 7774
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 7776
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 7778
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 7780
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 7782
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 7785
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 7787
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 7789
    sp = STACKTOP; //@line 7790
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 7793
   $81 = $0 + 24 | 0; //@line 7794
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 7798
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 7802
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 7809
       $$2 = $81; //@line 7810
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 7822
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 7823
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 7828
        $136 = $$2 + 8 | 0; //@line 7829
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 7832
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 167; //@line 7837
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 7839
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 7841
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 7843
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 7845
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 7847
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 7849
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 7851
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 7854
       sp = STACKTOP; //@line 7855
       return;
      }
      $104 = $1 + 24 | 0; //@line 7858
      $105 = $1 + 54 | 0; //@line 7859
      $$1 = $81; //@line 7860
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 7876
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 7877
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7882
       $122 = $$1 + 8 | 0; //@line 7883
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 7886
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 166; //@line 7891
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 7893
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 7895
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 7897
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 7899
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 7901
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 7903
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 7905
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 7907
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 7910
      sp = STACKTOP; //@line 7911
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 7915
    $$0 = $81; //@line 7916
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 7923
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 7924
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 7929
     $100 = $$0 + 8 | 0; //@line 7930
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 7933
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 165; //@line 7938
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 7940
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 7942
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 7944
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 7946
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 7948
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 7950
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 7953
    sp = STACKTOP; //@line 7954
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4385
 STACKTOP = STACKTOP + 32 | 0; //@line 4386
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4386
 $0 = sp; //@line 4387
 _gpio_init_out($0, 50); //@line 4388
 while (1) {
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4391
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4392
  _wait_ms(150); //@line 4393
  if (___async) {
   label = 3; //@line 4396
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 4399
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4401
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4402
  _wait_ms(150); //@line 4403
  if (___async) {
   label = 5; //@line 4406
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 4409
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4411
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4412
  _wait_ms(150); //@line 4413
  if (___async) {
   label = 7; //@line 4416
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 4419
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4421
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4422
  _wait_ms(150); //@line 4423
  if (___async) {
   label = 9; //@line 4426
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 4429
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4431
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4432
  _wait_ms(150); //@line 4433
  if (___async) {
   label = 11; //@line 4436
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 4439
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4441
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4442
  _wait_ms(150); //@line 4443
  if (___async) {
   label = 13; //@line 4446
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 4449
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4451
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4452
  _wait_ms(150); //@line 4453
  if (___async) {
   label = 15; //@line 4456
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 4459
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4461
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4462
  _wait_ms(150); //@line 4463
  if (___async) {
   label = 17; //@line 4466
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 4469
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4471
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4472
  _wait_ms(400); //@line 4473
  if (___async) {
   label = 19; //@line 4476
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 4479
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4481
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4482
  _wait_ms(400); //@line 4483
  if (___async) {
   label = 21; //@line 4486
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 4489
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4491
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4492
  _wait_ms(400); //@line 4493
  if (___async) {
   label = 23; //@line 4496
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 4499
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4501
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4502
  _wait_ms(400); //@line 4503
  if (___async) {
   label = 25; //@line 4506
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 4509
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4511
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4512
  _wait_ms(400); //@line 4513
  if (___async) {
   label = 27; //@line 4516
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 4519
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4521
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4522
  _wait_ms(400); //@line 4523
  if (___async) {
   label = 29; //@line 4526
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 4529
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4531
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4532
  _wait_ms(400); //@line 4533
  if (___async) {
   label = 31; //@line 4536
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4539
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4541
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4542
  _wait_ms(400); //@line 4543
  if (___async) {
   label = 33; //@line 4546
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4549
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 93; //@line 4553
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 4555
   sp = STACKTOP; //@line 4556
   STACKTOP = sp; //@line 4557
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 94; //@line 4561
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 4563
   sp = STACKTOP; //@line 4564
   STACKTOP = sp; //@line 4565
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 95; //@line 4569
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 4571
   sp = STACKTOP; //@line 4572
   STACKTOP = sp; //@line 4573
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 96; //@line 4577
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 4579
   sp = STACKTOP; //@line 4580
   STACKTOP = sp; //@line 4581
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 97; //@line 4585
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 4587
   sp = STACKTOP; //@line 4588
   STACKTOP = sp; //@line 4589
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 98; //@line 4593
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 4595
   sp = STACKTOP; //@line 4596
   STACKTOP = sp; //@line 4597
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 99; //@line 4601
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 4603
   sp = STACKTOP; //@line 4604
   STACKTOP = sp; //@line 4605
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 100; //@line 4609
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 4611
   sp = STACKTOP; //@line 4612
   STACKTOP = sp; //@line 4613
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 101; //@line 4617
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 4619
   sp = STACKTOP; //@line 4620
   STACKTOP = sp; //@line 4621
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 102; //@line 4625
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 4627
   sp = STACKTOP; //@line 4628
   STACKTOP = sp; //@line 4629
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 103; //@line 4633
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 4635
   sp = STACKTOP; //@line 4636
   STACKTOP = sp; //@line 4637
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 104; //@line 4641
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 4643
   sp = STACKTOP; //@line 4644
   STACKTOP = sp; //@line 4645
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 105; //@line 4649
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 4651
   sp = STACKTOP; //@line 4652
   STACKTOP = sp; //@line 4653
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 106; //@line 4657
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 4659
   sp = STACKTOP; //@line 4660
   STACKTOP = sp; //@line 4661
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 107; //@line 4665
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4667
   sp = STACKTOP; //@line 4668
   STACKTOP = sp; //@line 4669
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 108; //@line 4673
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4675
   sp = STACKTOP; //@line 4676
   STACKTOP = sp; //@line 4677
   return;
  }
 }
}
function _try_realloc_chunk($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1272 = 0, $$1275 = 0, $$2 = 0, $$3 = 0, $$pre$phiZ2D = 0, $101 = 0, $103 = 0, $106 = 0, $108 = 0, $11 = 0, $111 = 0, $114 = 0, $115 = 0, $116 = 0, $118 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $129 = 0, $130 = 0, $144 = 0, $147 = 0, $148 = 0, $154 = 0, $165 = 0, $168 = 0, $175 = 0, $2 = 0, $24 = 0, $26 = 0, $3 = 0, $37 = 0, $39 = 0, $4 = 0, $40 = 0, $49 = 0, $5 = 0, $51 = 0, $53 = 0, $54 = 0, $6 = 0, $60 = 0, $67 = 0, $73 = 0, $75 = 0, $76 = 0, $79 = 0, $8 = 0, $81 = 0, $83 = 0, $96 = 0, $storemerge = 0, $storemerge4 = 0;
 $2 = $0 + 4 | 0; //@line 8633
 $3 = HEAP32[$2 >> 2] | 0; //@line 8634
 $4 = $3 & -8; //@line 8635
 $5 = $0 + $4 | 0; //@line 8636
 $6 = HEAP32[1491] | 0; //@line 8637
 $8 = $3 & 3; //@line 8639
 if (!(($8 | 0) != 1 & $6 >>> 0 <= $0 >>> 0 & $5 >>> 0 > $0 >>> 0)) {
  _abort(); //@line 8645
 }
 $11 = $5 + 4 | 0; //@line 8648
 $12 = HEAP32[$11 >> 2] | 0; //@line 8649
 if (!($12 & 1)) {
  _abort(); //@line 8653
 }
 if (!$8) {
  if ($1 >>> 0 < 256) {
   $$2 = 0; //@line 8660
   return $$2 | 0; //@line 8661
  }
  if ($4 >>> 0 >= ($1 + 4 | 0) >>> 0) {
   if (($4 - $1 | 0) >>> 0 <= HEAP32[1607] << 1 >>> 0) {
    $$2 = $0; //@line 8671
    return $$2 | 0; //@line 8672
   }
  }
  $$2 = 0; //@line 8675
  return $$2 | 0; //@line 8676
 }
 if ($4 >>> 0 >= $1 >>> 0) {
  $24 = $4 - $1 | 0; //@line 8680
  if ($24 >>> 0 <= 15) {
   $$2 = $0; //@line 8683
   return $$2 | 0; //@line 8684
  }
  $26 = $0 + $1 | 0; //@line 8686
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8690
  HEAP32[$26 + 4 >> 2] = $24 | 3; //@line 8693
  HEAP32[$11 >> 2] = HEAP32[$11 >> 2] | 1; //@line 8696
  _dispose_chunk($26, $24); //@line 8697
  $$2 = $0; //@line 8698
  return $$2 | 0; //@line 8699
 }
 if ((HEAP32[1493] | 0) == ($5 | 0)) {
  $37 = (HEAP32[1490] | 0) + $4 | 0; //@line 8705
  $39 = $37 - $1 | 0; //@line 8707
  $40 = $0 + $1 | 0; //@line 8708
  if ($37 >>> 0 <= $1 >>> 0) {
   $$2 = 0; //@line 8710
   return $$2 | 0; //@line 8711
  }
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8718
  HEAP32[$40 + 4 >> 2] = $39 | 1; //@line 8719
  HEAP32[1493] = $40; //@line 8720
  HEAP32[1490] = $39; //@line 8721
  $$2 = $0; //@line 8722
  return $$2 | 0; //@line 8723
 }
 if ((HEAP32[1492] | 0) == ($5 | 0)) {
  $49 = (HEAP32[1489] | 0) + $4 | 0; //@line 8729
  if ($49 >>> 0 < $1 >>> 0) {
   $$2 = 0; //@line 8732
   return $$2 | 0; //@line 8733
  }
  $51 = $49 - $1 | 0; //@line 8735
  if ($51 >>> 0 > 15) {
   $53 = $0 + $1 | 0; //@line 8738
   $54 = $0 + $49 | 0; //@line 8739
   HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8743
   HEAP32[$53 + 4 >> 2] = $51 | 1; //@line 8746
   HEAP32[$54 >> 2] = $51; //@line 8747
   $60 = $54 + 4 | 0; //@line 8748
   HEAP32[$60 >> 2] = HEAP32[$60 >> 2] & -2; //@line 8751
   $storemerge = $53; //@line 8752
   $storemerge4 = $51; //@line 8752
  } else {
   HEAP32[$2 >> 2] = $3 & 1 | $49 | 2; //@line 8757
   $67 = $0 + $49 + 4 | 0; //@line 8759
   HEAP32[$67 >> 2] = HEAP32[$67 >> 2] | 1; //@line 8762
   $storemerge = 0; //@line 8763
   $storemerge4 = 0; //@line 8763
  }
  HEAP32[1489] = $storemerge4; //@line 8765
  HEAP32[1492] = $storemerge; //@line 8766
  $$2 = $0; //@line 8767
  return $$2 | 0; //@line 8768
 }
 if ($12 & 2 | 0) {
  $$2 = 0; //@line 8773
  return $$2 | 0; //@line 8774
 }
 $73 = ($12 & -8) + $4 | 0; //@line 8777
 if ($73 >>> 0 < $1 >>> 0) {
  $$2 = 0; //@line 8780
  return $$2 | 0; //@line 8781
 }
 $75 = $73 - $1 | 0; //@line 8783
 $76 = $12 >>> 3; //@line 8784
 L49 : do {
  if ($12 >>> 0 < 256) {
   $79 = HEAP32[$5 + 8 >> 2] | 0; //@line 8789
   $81 = HEAP32[$5 + 12 >> 2] | 0; //@line 8791
   $83 = 5988 + ($76 << 1 << 2) | 0; //@line 8793
   if (($79 | 0) != ($83 | 0)) {
    if ($6 >>> 0 > $79 >>> 0) {
     _abort(); //@line 8798
    }
    if ((HEAP32[$79 + 12 >> 2] | 0) != ($5 | 0)) {
     _abort(); //@line 8805
    }
   }
   if (($81 | 0) == ($79 | 0)) {
    HEAP32[1487] = HEAP32[1487] & ~(1 << $76); //@line 8815
    break;
   }
   if (($81 | 0) == ($83 | 0)) {
    $$pre$phiZ2D = $81 + 8 | 0; //@line 8821
   } else {
    if ($6 >>> 0 > $81 >>> 0) {
     _abort(); //@line 8825
    }
    $96 = $81 + 8 | 0; //@line 8828
    if ((HEAP32[$96 >> 2] | 0) == ($5 | 0)) {
     $$pre$phiZ2D = $96; //@line 8832
    } else {
     _abort(); //@line 8834
    }
   }
   HEAP32[$79 + 12 >> 2] = $81; //@line 8839
   HEAP32[$$pre$phiZ2D >> 2] = $79; //@line 8840
  } else {
   $101 = HEAP32[$5 + 24 >> 2] | 0; //@line 8843
   $103 = HEAP32[$5 + 12 >> 2] | 0; //@line 8845
   do {
    if (($103 | 0) == ($5 | 0)) {
     $114 = $5 + 16 | 0; //@line 8849
     $115 = $114 + 4 | 0; //@line 8850
     $116 = HEAP32[$115 >> 2] | 0; //@line 8851
     if (!$116) {
      $118 = HEAP32[$114 >> 2] | 0; //@line 8854
      if (!$118) {
       $$3 = 0; //@line 8857
       break;
      } else {
       $$1272 = $118; //@line 8860
       $$1275 = $114; //@line 8860
      }
     } else {
      $$1272 = $116; //@line 8863
      $$1275 = $115; //@line 8863
     }
     while (1) {
      $120 = $$1272 + 20 | 0; //@line 8866
      $121 = HEAP32[$120 >> 2] | 0; //@line 8867
      if ($121 | 0) {
       $$1272 = $121; //@line 8870
       $$1275 = $120; //@line 8870
       continue;
      }
      $123 = $$1272 + 16 | 0; //@line 8873
      $124 = HEAP32[$123 >> 2] | 0; //@line 8874
      if (!$124) {
       break;
      } else {
       $$1272 = $124; //@line 8879
       $$1275 = $123; //@line 8879
      }
     }
     if ($6 >>> 0 > $$1275 >>> 0) {
      _abort(); //@line 8884
     } else {
      HEAP32[$$1275 >> 2] = 0; //@line 8887
      $$3 = $$1272; //@line 8888
      break;
     }
    } else {
     $106 = HEAP32[$5 + 8 >> 2] | 0; //@line 8893
     if ($6 >>> 0 > $106 >>> 0) {
      _abort(); //@line 8896
     }
     $108 = $106 + 12 | 0; //@line 8899
     if ((HEAP32[$108 >> 2] | 0) != ($5 | 0)) {
      _abort(); //@line 8903
     }
     $111 = $103 + 8 | 0; //@line 8906
     if ((HEAP32[$111 >> 2] | 0) == ($5 | 0)) {
      HEAP32[$108 >> 2] = $103; //@line 8910
      HEAP32[$111 >> 2] = $106; //@line 8911
      $$3 = $103; //@line 8912
      break;
     } else {
      _abort(); //@line 8915
     }
    }
   } while (0);
   if ($101 | 0) {
    $129 = HEAP32[$5 + 28 >> 2] | 0; //@line 8923
    $130 = 6252 + ($129 << 2) | 0; //@line 8924
    do {
     if ((HEAP32[$130 >> 2] | 0) == ($5 | 0)) {
      HEAP32[$130 >> 2] = $$3; //@line 8929
      if (!$$3) {
       HEAP32[1488] = HEAP32[1488] & ~(1 << $129); //@line 8936
       break L49;
      }
     } else {
      if ((HEAP32[1491] | 0) >>> 0 > $101 >>> 0) {
       _abort(); //@line 8943
      } else {
       HEAP32[$101 + 16 + (((HEAP32[$101 + 16 >> 2] | 0) != ($5 | 0) & 1) << 2) >> 2] = $$3; //@line 8951
       if (!$$3) {
        break L49;
       } else {
        break;
       }
      }
     }
    } while (0);
    $144 = HEAP32[1491] | 0; //@line 8961
    if ($144 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 8964
    }
    HEAP32[$$3 + 24 >> 2] = $101; //@line 8968
    $147 = $5 + 16 | 0; //@line 8969
    $148 = HEAP32[$147 >> 2] | 0; //@line 8970
    do {
     if ($148 | 0) {
      if ($144 >>> 0 > $148 >>> 0) {
       _abort(); //@line 8976
      } else {
       HEAP32[$$3 + 16 >> 2] = $148; //@line 8980
       HEAP32[$148 + 24 >> 2] = $$3; //@line 8982
       break;
      }
     }
    } while (0);
    $154 = HEAP32[$147 + 4 >> 2] | 0; //@line 8988
    if ($154 | 0) {
     if ((HEAP32[1491] | 0) >>> 0 > $154 >>> 0) {
      _abort(); //@line 8994
     } else {
      HEAP32[$$3 + 20 >> 2] = $154; //@line 8998
      HEAP32[$154 + 24 >> 2] = $$3; //@line 9000
      break;
     }
    }
   }
  }
 } while (0);
 if ($75 >>> 0 < 16) {
  HEAP32[$2 >> 2] = $73 | $3 & 1 | 2; //@line 9012
  $165 = $0 + $73 + 4 | 0; //@line 9014
  HEAP32[$165 >> 2] = HEAP32[$165 >> 2] | 1; //@line 9017
  $$2 = $0; //@line 9018
  return $$2 | 0; //@line 9019
 } else {
  $168 = $0 + $1 | 0; //@line 9021
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 9025
  HEAP32[$168 + 4 >> 2] = $75 | 3; //@line 9028
  $175 = $0 + $73 + 4 | 0; //@line 9030
  HEAP32[$175 >> 2] = HEAP32[$175 >> 2] | 1; //@line 9033
  _dispose_chunk($168, $75); //@line 9034
  $$2 = $0; //@line 9035
  return $$2 | 0; //@line 9036
 }
 return 0; //@line 9038
}
function ___floatscan($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$0105$ph = 0, $$0106$ph = 0, $$0107$lcssa = 0, $$0107127 = 0, $$0113 = 0, $$0114 = 0.0, $$1$lcssa = 0, $$1108 = 0, $$1128 = 0, $$2 = 0, $$2109125 = 0, $$3110 = 0, $$3126 = 0, $$4 = 0, $$4111 = 0, $$5 = 0, $$6 = 0, $$in = 0, $102 = 0, $118 = 0, $12 = 0, $126 = 0, $18 = 0, $19 = 0, $3 = 0, $32 = 0, $39 = 0, $4 = 0, $42 = 0, $45 = 0, $5 = 0, $63 = 0, $70 = 0, $72 = 0, $80 = 0, $85 = 0, $93 = 0, label = 0;
 switch ($1 | 0) {
 case 0:
  {
   $$0105$ph = -149; //@line 752
   $$0106$ph = 24; //@line 752
   label = 4; //@line 753
   break;
  }
 case 1:
  {
   $$0105$ph = -1074; //@line 757
   $$0106$ph = 53; //@line 757
   label = 4; //@line 758
   break;
  }
 case 2:
  {
   $$0105$ph = -1074; //@line 762
   $$0106$ph = 53; //@line 762
   label = 4; //@line 763
   break;
  }
 default:
  {
   $$0114 = 0.0; //@line 767
  }
 }
 L4 : do {
  if ((label | 0) == 4) {
   $3 = $0 + 4 | 0; //@line 772
   $4 = $0 + 100 | 0; //@line 773
   do {
    $5 = HEAP32[$3 >> 2] | 0; //@line 775
    if ($5 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$3 >> 2] = $5 + 1; //@line 780
     $12 = HEAPU8[$5 >> 0] | 0; //@line 783
    } else {
     $12 = ___shgetc($0) | 0; //@line 786
    }
   } while ((_isspace($12) | 0) != 0);
   L13 : do {
    switch ($12 | 0) {
    case 43:
    case 45:
     {
      $18 = 1 - ((($12 | 0) == 45 & 1) << 1) | 0; //@line 800
      $19 = HEAP32[$3 >> 2] | 0; //@line 801
      if ($19 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
       HEAP32[$3 >> 2] = $19 + 1; //@line 806
       $$0 = HEAPU8[$19 >> 0] | 0; //@line 809
       $$0113 = $18; //@line 809
       break L13;
      } else {
       $$0 = ___shgetc($0) | 0; //@line 813
       $$0113 = $18; //@line 813
       break L13;
      }
      break;
     }
    default:
     {
      $$0 = $12; //@line 819
      $$0113 = 1; //@line 819
     }
    }
   } while (0);
   $$0107127 = 0; //@line 823
   $$1128 = $$0; //@line 823
   while (1) {
    if (($$1128 | 32 | 0) != (HEAP8[2654 + $$0107127 >> 0] | 0)) {
     $$0107$lcssa = $$0107127; //@line 831
     $$1$lcssa = $$1128; //@line 831
     break;
    }
    do {
     if ($$0107127 >>> 0 < 7) {
      $32 = HEAP32[$3 >> 2] | 0; //@line 837
      if ($32 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
       HEAP32[$3 >> 2] = $32 + 1; //@line 842
       $$2 = HEAPU8[$32 >> 0] | 0; //@line 845
       break;
      } else {
       $$2 = ___shgetc($0) | 0; //@line 849
       break;
      }
     } else {
      $$2 = $$1128; //@line 853
     }
    } while (0);
    $39 = $$0107127 + 1 | 0; //@line 856
    if ($39 >>> 0 < 8) {
     $$0107127 = $39; //@line 859
     $$1128 = $$2; //@line 859
    } else {
     $$0107$lcssa = $39; //@line 861
     $$1$lcssa = $$2; //@line 861
     break;
    }
   }
   L29 : do {
    switch ($$0107$lcssa | 0) {
    case 8:
     {
      break;
     }
    case 3:
     {
      label = 23; //@line 871
      break;
     }
    default:
     {
      $42 = ($2 | 0) != 0; //@line 876
      if ($42 & $$0107$lcssa >>> 0 > 3) {
       if (($$0107$lcssa | 0) == 8) {
        break L29;
       } else {
        label = 23; //@line 883
        break L29;
       }
      }
      L34 : do {
       if (!$$0107$lcssa) {
        $$2109125 = 0; //@line 890
        $$3126 = $$1$lcssa; //@line 890
        while (1) {
         if (($$3126 | 32 | 0) != (HEAP8[3437 + $$2109125 >> 0] | 0)) {
          $$3110 = $$2109125; //@line 898
          $$5 = $$3126; //@line 898
          break L34;
         }
         do {
          if ($$2109125 >>> 0 < 2) {
           $63 = HEAP32[$3 >> 2] | 0; //@line 904
           if ($63 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
            HEAP32[$3 >> 2] = $63 + 1; //@line 909
            $$4 = HEAPU8[$63 >> 0] | 0; //@line 912
            break;
           } else {
            $$4 = ___shgetc($0) | 0; //@line 916
            break;
           }
          } else {
           $$4 = $$3126; //@line 920
          }
         } while (0);
         $70 = $$2109125 + 1 | 0; //@line 923
         if ($70 >>> 0 < 3) {
          $$2109125 = $70; //@line 926
          $$3126 = $$4; //@line 926
         } else {
          $$3110 = $70; //@line 928
          $$5 = $$4; //@line 928
          break;
         }
        }
       } else {
        $$3110 = $$0107$lcssa; //@line 933
        $$5 = $$1$lcssa; //@line 933
       }
      } while (0);
      switch ($$3110 | 0) {
      case 3:
       {
        $72 = HEAP32[$3 >> 2] | 0; //@line 938
        if ($72 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
         HEAP32[$3 >> 2] = $72 + 1; //@line 943
         $80 = HEAPU8[$72 >> 0] | 0; //@line 946
        } else {
         $80 = ___shgetc($0) | 0; //@line 949
        }
        if (($80 | 0) == 40) {
         $$4111 = 1; //@line 953
        } else {
         if (!(HEAP32[$4 >> 2] | 0)) {
          $$0114 = nan; //@line 958
          break L4;
         }
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 963
         $$0114 = nan; //@line 964
         break L4;
        }
        while (1) {
         $85 = HEAP32[$3 >> 2] | 0; //@line 968
         if ($85 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
          HEAP32[$3 >> 2] = $85 + 1; //@line 973
          $93 = HEAPU8[$85 >> 0] | 0; //@line 976
         } else {
          $93 = ___shgetc($0) | 0; //@line 979
         }
         if (!(($93 + -48 | 0) >>> 0 < 10 | ($93 + -65 | 0) >>> 0 < 26)) {
          if (!(($93 | 0) == 95 | ($93 + -97 | 0) >>> 0 < 26)) {
           break;
          }
         }
         $$4111 = $$4111 + 1 | 0; //@line 996
        }
        if (($93 | 0) == 41) {
         $$0114 = nan; //@line 1000
         break L4;
        }
        $102 = (HEAP32[$4 >> 2] | 0) == 0; //@line 1004
        if (!$102) {
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1008
        }
        if (!$42) {
         HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1012
         ___shlim($0, 0); //@line 1013
         $$0114 = 0.0; //@line 1014
         break L4;
        }
        if (!$$4111) {
         $$0114 = nan; //@line 1019
         break L4;
        } else {
         $$in = $$4111; //@line 1022
        }
        while (1) {
         $$in = $$in + -1 | 0; //@line 1025
         if (!$102) {
          HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1029
         }
         if (!$$in) {
          $$0114 = nan; //@line 1033
          break L4;
         }
        }
        break;
       }
      case 0:
       {
        if (($$5 | 0) == 48) {
         $118 = HEAP32[$3 >> 2] | 0; //@line 1044
         if ($118 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
          HEAP32[$3 >> 2] = $118 + 1; //@line 1049
          $126 = HEAPU8[$118 >> 0] | 0; //@line 1052
         } else {
          $126 = ___shgetc($0) | 0; //@line 1055
         }
         if (($126 | 32 | 0) == 120) {
          $$0114 = +_hexfloat($0, $$0106$ph, $$0105$ph, $$0113, $2); //@line 1061
          break L4;
         }
         if (!(HEAP32[$4 >> 2] | 0)) {
          $$6 = 48; //@line 1067
         } else {
          HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1071
          $$6 = 48; //@line 1072
         }
        } else {
         $$6 = $$5; //@line 1075
        }
        $$0114 = +_decfloat($0, $$6, $$0106$ph, $$0105$ph, $$0113, $2); //@line 1078
        break L4;
        break;
       }
      default:
       {
        if (HEAP32[$4 >> 2] | 0) {
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1088
        }
        HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1091
        ___shlim($0, 0); //@line 1092
        $$0114 = 0.0; //@line 1093
        break L4;
       }
      }
     }
    }
   } while (0);
   if ((label | 0) == 23) {
    $45 = (HEAP32[$4 >> 2] | 0) == 0; //@line 1102
    if (!$45) {
     HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1106
    }
    if (($2 | 0) != 0 & $$0107$lcssa >>> 0 > 3) {
     $$1108 = $$0107$lcssa; //@line 1112
     do {
      if (!$45) {
       HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1117
      }
      $$1108 = $$1108 + -1 | 0; //@line 1119
     } while ($$1108 >>> 0 > 3);
    }
   }
   $$0114 = +($$0113 | 0) * inf; //@line 1132
  }
 } while (0);
 return +$$0114;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_34($0) {
 $0 = $0 | 0;
 var $$019$i = 0, $$2 = 0, $$byval_copy = 0, $$sink$i = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $33 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $48 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 619
 STACKTOP = STACKTOP + 32 | 0; //@line 620
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 620
 $$byval_copy = sp; //@line 621
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 623
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 625
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 627
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 629
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 631
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 633
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 635
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 637
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 639
 if (!$AsyncRetVal) {
  __ZN6Socket11set_timeoutEi($8, 5e3); //@line 642
  $19 = _malloc(512) | 0; //@line 643
  if (!$19) {
   $$2 = -3007; //@line 646
  } else {
   $21 = $19; //@line 648
   $22 = $19 + 1 | 0; //@line 649
   $23 = $19 + 2 | 0; //@line 650
   $24 = $19 + 3 | 0; //@line 651
   $25 = $19 + 4 | 0; //@line 652
   $26 = $19 + 5 | 0; //@line 653
   $27 = $19 + 6 | 0; //@line 654
   $28 = $19 + 7 | 0; //@line 655
   $29 = $19 + 12 | 0; //@line 656
   $$sink$i = ($16 | 0) == 2 ? 28 : 1; //@line 658
   HEAP8[$19 >> 0] = 0; //@line 659
   HEAP8[$22 >> 0] = 1; //@line 660
   HEAP8[$23 >> 0] = 1; //@line 661
   HEAP8[$24 >> 0] = 0; //@line 662
   HEAP8[$25 >> 0] = 0; //@line 663
   HEAP8[$26 >> 0] = 1; //@line 664
   HEAP8[$27 >> 0] = 0; //@line 665
   HEAP8[$27 + 1 >> 0] = 0; //@line 665
   HEAP8[$27 + 2 >> 0] = 0; //@line 665
   HEAP8[$27 + 3 >> 0] = 0; //@line 665
   HEAP8[$27 + 4 >> 0] = 0; //@line 665
   HEAP8[$27 + 5 >> 0] = 0; //@line 665
   if (!(HEAP8[$2 >> 0] | 0)) {
    $48 = $29; //@line 669
   } else {
    $$019$i = $2; //@line 671
    $36 = $29; //@line 671
    while (1) {
     $33 = _strcspn($$019$i, 3461) | 0; //@line 673
     $35 = $36 + 1 | 0; //@line 675
     HEAP8[$36 >> 0] = $33; //@line 676
     $37 = $33 & 255; //@line 677
     _memcpy($35 | 0, $$019$i | 0, $37 | 0) | 0; //@line 678
     $38 = $35 + $37 | 0; //@line 679
     $$019$i = $$019$i + ($33 + ((HEAP8[$$019$i + $33 >> 0] | 0) == 46 & 1)) | 0; //@line 685
     if (!(HEAP8[$$019$i >> 0] | 0)) {
      $48 = $38; //@line 689
      break;
     } else {
      $36 = $38; //@line 692
     }
    }
   }
   HEAP8[$48 >> 0] = 0; //@line 697
   HEAP8[$48 + 1 >> 0] = 0; //@line 699
   HEAP8[$48 + 2 >> 0] = $$sink$i; //@line 701
   HEAP8[$48 + 3 >> 0] = 0; //@line 703
   HEAP8[$48 + 4 >> 0] = 1; //@line 704
   HEAP32[$$byval_copy >> 2] = HEAP32[114]; //@line 705
   HEAP32[$$byval_copy + 4 >> 2] = HEAP32[115]; //@line 705
   HEAP32[$$byval_copy + 8 >> 2] = HEAP32[116]; //@line 705
   HEAP32[$$byval_copy + 12 >> 2] = HEAP32[117]; //@line 705
   HEAP32[$$byval_copy + 16 >> 2] = HEAP32[118]; //@line 705
   __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy, 53); //@line 706
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(80) | 0; //@line 710
   $55 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($4, $6, $19, $48 + 5 - $21 | 0) | 0; //@line 711
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 79; //@line 714
    $56 = $ReallocAsyncCtx10 + 4 | 0; //@line 715
    HEAP32[$56 >> 2] = $19; //@line 716
    $57 = $ReallocAsyncCtx10 + 8 | 0; //@line 717
    HEAP32[$57 >> 2] = $22; //@line 718
    $58 = $ReallocAsyncCtx10 + 12 | 0; //@line 719
    HEAP32[$58 >> 2] = $23; //@line 720
    $59 = $ReallocAsyncCtx10 + 16 | 0; //@line 721
    HEAP32[$59 >> 2] = $24; //@line 722
    $60 = $ReallocAsyncCtx10 + 20 | 0; //@line 723
    HEAP32[$60 >> 2] = $25; //@line 724
    $61 = $ReallocAsyncCtx10 + 24 | 0; //@line 725
    HEAP32[$61 >> 2] = $26; //@line 726
    $62 = $ReallocAsyncCtx10 + 28 | 0; //@line 727
    HEAP32[$62 >> 2] = $27; //@line 728
    $63 = $ReallocAsyncCtx10 + 32 | 0; //@line 729
    HEAP32[$63 >> 2] = $2; //@line 730
    $64 = $ReallocAsyncCtx10 + 36 | 0; //@line 731
    HEAP32[$64 >> 2] = $4; //@line 732
    $65 = $ReallocAsyncCtx10 + 40 | 0; //@line 733
    HEAP32[$65 >> 2] = $29; //@line 734
    $66 = $ReallocAsyncCtx10 + 44 | 0; //@line 735
    HEAP8[$66 >> 0] = $$sink$i; //@line 736
    $67 = $ReallocAsyncCtx10 + 48 | 0; //@line 737
    HEAP32[$67 >> 2] = $6; //@line 738
    $68 = $ReallocAsyncCtx10 + 52 | 0; //@line 739
    HEAP32[$68 >> 2] = $6; //@line 740
    $69 = $ReallocAsyncCtx10 + 56 | 0; //@line 741
    HEAP32[$69 >> 2] = $21; //@line 742
    $70 = $ReallocAsyncCtx10 + 60 | 0; //@line 743
    HEAP32[$70 >> 2] = $8; //@line 744
    $71 = $ReallocAsyncCtx10 + 64 | 0; //@line 745
    HEAP32[$71 >> 2] = $10; //@line 746
    $72 = $ReallocAsyncCtx10 + 68 | 0; //@line 747
    HEAP32[$72 >> 2] = $28; //@line 748
    $73 = $ReallocAsyncCtx10 + 72 | 0; //@line 749
    HEAP32[$73 >> 2] = $12; //@line 750
    $74 = $ReallocAsyncCtx10 + 76 | 0; //@line 751
    HEAP32[$74 >> 2] = $14; //@line 752
    sp = STACKTOP; //@line 753
    STACKTOP = sp; //@line 754
    return;
   }
   HEAP32[___async_retval >> 2] = $55; //@line 757
   ___async_unwind = 0; //@line 758
   HEAP32[$ReallocAsyncCtx10 >> 2] = 79; //@line 759
   $56 = $ReallocAsyncCtx10 + 4 | 0; //@line 760
   HEAP32[$56 >> 2] = $19; //@line 761
   $57 = $ReallocAsyncCtx10 + 8 | 0; //@line 762
   HEAP32[$57 >> 2] = $22; //@line 763
   $58 = $ReallocAsyncCtx10 + 12 | 0; //@line 764
   HEAP32[$58 >> 2] = $23; //@line 765
   $59 = $ReallocAsyncCtx10 + 16 | 0; //@line 766
   HEAP32[$59 >> 2] = $24; //@line 767
   $60 = $ReallocAsyncCtx10 + 20 | 0; //@line 768
   HEAP32[$60 >> 2] = $25; //@line 769
   $61 = $ReallocAsyncCtx10 + 24 | 0; //@line 770
   HEAP32[$61 >> 2] = $26; //@line 771
   $62 = $ReallocAsyncCtx10 + 28 | 0; //@line 772
   HEAP32[$62 >> 2] = $27; //@line 773
   $63 = $ReallocAsyncCtx10 + 32 | 0; //@line 774
   HEAP32[$63 >> 2] = $2; //@line 775
   $64 = $ReallocAsyncCtx10 + 36 | 0; //@line 776
   HEAP32[$64 >> 2] = $4; //@line 777
   $65 = $ReallocAsyncCtx10 + 40 | 0; //@line 778
   HEAP32[$65 >> 2] = $29; //@line 779
   $66 = $ReallocAsyncCtx10 + 44 | 0; //@line 780
   HEAP8[$66 >> 0] = $$sink$i; //@line 781
   $67 = $ReallocAsyncCtx10 + 48 | 0; //@line 782
   HEAP32[$67 >> 2] = $6; //@line 783
   $68 = $ReallocAsyncCtx10 + 52 | 0; //@line 784
   HEAP32[$68 >> 2] = $6; //@line 785
   $69 = $ReallocAsyncCtx10 + 56 | 0; //@line 786
   HEAP32[$69 >> 2] = $21; //@line 787
   $70 = $ReallocAsyncCtx10 + 60 | 0; //@line 788
   HEAP32[$70 >> 2] = $8; //@line 789
   $71 = $ReallocAsyncCtx10 + 64 | 0; //@line 790
   HEAP32[$71 >> 2] = $10; //@line 791
   $72 = $ReallocAsyncCtx10 + 68 | 0; //@line 792
   HEAP32[$72 >> 2] = $28; //@line 793
   $73 = $ReallocAsyncCtx10 + 72 | 0; //@line 794
   HEAP32[$73 >> 2] = $12; //@line 795
   $74 = $ReallocAsyncCtx10 + 76 | 0; //@line 796
   HEAP32[$74 >> 2] = $14; //@line 797
   sp = STACKTOP; //@line 798
   STACKTOP = sp; //@line 799
   return;
  }
 } else {
  $$2 = $AsyncRetVal; //@line 802
 }
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(12) | 0; //@line 804
 __ZN9UDPSocketD2Ev($4); //@line 805
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 82; //@line 808
  $76 = $ReallocAsyncCtx11 + 4 | 0; //@line 809
  HEAP32[$76 >> 2] = $12; //@line 810
  $77 = $ReallocAsyncCtx11 + 8 | 0; //@line 811
  HEAP32[$77 >> 2] = $$2; //@line 812
  sp = STACKTOP; //@line 813
  STACKTOP = sp; //@line 814
  return;
 }
 ___async_unwind = 0; //@line 816
 HEAP32[$ReallocAsyncCtx11 >> 2] = 82; //@line 817
 $76 = $ReallocAsyncCtx11 + 4 | 0; //@line 818
 HEAP32[$76 >> 2] = $12; //@line 819
 $77 = $ReallocAsyncCtx11 + 8 | 0; //@line 820
 HEAP32[$77 >> 2] = $$2; //@line 821
 sp = STACKTOP; //@line 822
 STACKTOP = sp; //@line 823
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$lcssa$i = 0, $10 = 0, $109 = 0, $114 = 0, $115 = 0, $117 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $196 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $45 = 0, $51 = 0, $58 = 0, $59 = 0, $6 = 0, $64 = 0, $66 = 0, $67 = 0, $70 = 0, $74 = 0, $75 = 0, $79 = 0, $8 = 0, $82 = 0, $84 = 0, $85 = 0, $90 = 0, $98 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9835
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9837
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9839
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9841
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9843
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9845
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9847
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9849
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9851
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9853
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9855
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9857
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9859
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9861
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9863
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9865
 if (($AsyncRetVal | 0) == -3001) {
  $$355 = -3009; //@line 9868
 } else {
  if (($AsyncRetVal | 0) < 0) {
   $$355 = $AsyncRetVal; //@line 9872
  } else {
   $45 = (HEAPU8[$18 >> 0] | 0) << 8 | (HEAPU8[$20 >> 0] | 0); //@line 9888
   $51 = (HEAPU8[$22 >> 0] | 0) << 8 | (HEAPU8[$24 >> 0] | 0); //@line 9894
   if (((HEAP8[$14 >> 0] & -8) << 24 >> 24 == -128 ? ((HEAPU8[$2 >> 0] | 0) << 8 | (HEAPU8[$12 >> 0] | 0) | 0) == 1 : 0) & (HEAP8[$16 >> 0] & 15) == 0) {
    if (!$45) {
     $196 = $10; //@line 9904
    } else {
     $$093119$i = 0; //@line 9906
     $59 = $10; //@line 9906
     while (1) {
      $58 = HEAP8[$59 >> 0] | 0; //@line 9908
      if (!($58 << 24 >> 24)) {
       $$lcssa$i = $59; //@line 9911
      } else {
       $64 = $59; //@line 9913
       $66 = $58; //@line 9913
       while (1) {
        $67 = $64 + 1 + ($66 & 255) | 0; //@line 9917
        $66 = HEAP8[$67 >> 0] | 0; //@line 9918
        if (!($66 << 24 >> 24)) {
         $$lcssa$i = $67; //@line 9921
         break;
        } else {
         $64 = $67; //@line 9924
        }
       }
      }
      $70 = $$lcssa$i + 5 | 0; //@line 9928
      $$093119$i = $$093119$i + 1 | 0; //@line 9929
      if (($$093119$i | 0) >= ($45 | 0)) {
       $196 = $70; //@line 9934
       break;
      } else {
       $59 = $70; //@line 9932
      }
     }
    }
    if (($6 | 0) != 0 & ($51 | 0) != 0) {
     $$090117$i = $28; //@line 9943
     $$094116$i = 0; //@line 9943
     $$095115$i = 0; //@line 9943
     $74 = $196; //@line 9943
     while (1) {
      $75 = HEAP8[$74 >> 0] | 0; //@line 9946
      do {
       if (!($75 << 24 >> 24)) {
        $90 = $74 + 1 | 0; //@line 9950
       } else {
        $79 = $75 & 255; //@line 9953
        $82 = $74; //@line 9953
        while (1) {
         if ($79 & 192 | 0) {
          label = 12; //@line 9958
          break;
         }
         $84 = $82 + 1 + $79 | 0; //@line 9962
         $85 = HEAP8[$84 >> 0] | 0; //@line 9963
         if (!($85 << 24 >> 24)) {
          label = 14; //@line 9967
          break;
         } else {
          $79 = $85 & 255; //@line 9970
          $82 = $84; //@line 9970
         }
        }
        if ((label | 0) == 12) {
         label = 0; //@line 9974
         $90 = $82 + 2 | 0; //@line 9976
         break;
        } else if ((label | 0) == 14) {
         label = 0; //@line 9980
         $90 = $84 + 1 | 0; //@line 9982
         break;
        }
       }
      } while (0);
      $98 = ((HEAPU8[$90 >> 0] | 0) << 8 | (HEAPU8[$90 + 1 >> 0] | 0)) & 65535; //@line 9995
      $109 = $90 + 10 | 0; //@line 10006
      $114 = (HEAPU8[$90 + 8 >> 0] | 0) << 8 | (HEAPU8[$90 + 9 >> 0] | 0); //@line 10011
      $115 = $114 & 65535; //@line 10012
      $117 = ((HEAPU8[$90 + 2 >> 0] | 0) << 8 | (HEAPU8[$90 + 3 >> 0] | 0) | 0) == 1; //@line 10014
      do {
       if ($98 << 16 >> 16 == 1 & $117 & $115 << 16 >> 16 == 4) {
        HEAP32[$$090117$i >> 2] = 1; //@line 10020
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$109 >> 0] | 0; //@line 10024
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$90 + 11 >> 0] | 0; //@line 10028
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$90 + 12 >> 0] | 0; //@line 10032
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$90 + 13 >> 0] | 0; //@line 10036
        $$0 = $90 + 14 | 0; //@line 10039
        $$1$i = $$090117$i + 20 | 0; //@line 10039
        $$196$i = $$095115$i + 1 | 0; //@line 10039
       } else {
        if ($98 << 16 >> 16 == 28 & $117 & $115 << 16 >> 16 == 16) {
         HEAP32[$$090117$i >> 2] = 2; //@line 10046
         HEAP8[$$090117$i + 4 >> 0] = HEAP8[$109 >> 0] | 0; //@line 10050
         HEAP8[$$090117$i + 5 >> 0] = HEAP8[$90 + 11 >> 0] | 0; //@line 10054
         HEAP8[$$090117$i + 6 >> 0] = HEAP8[$90 + 12 >> 0] | 0; //@line 10058
         HEAP8[$$090117$i + 7 >> 0] = HEAP8[$90 + 13 >> 0] | 0; //@line 10062
         HEAP8[$$090117$i + 8 >> 0] = HEAP8[$90 + 14 >> 0] | 0; //@line 10066
         HEAP8[$$090117$i + 9 >> 0] = HEAP8[$90 + 15 >> 0] | 0; //@line 10070
         HEAP8[$$090117$i + 10 >> 0] = HEAP8[$90 + 16 >> 0] | 0; //@line 10074
         HEAP8[$$090117$i + 11 >> 0] = HEAP8[$90 + 17 >> 0] | 0; //@line 10078
         HEAP8[$$090117$i + 12 >> 0] = HEAP8[$90 + 18 >> 0] | 0; //@line 10082
         HEAP8[$$090117$i + 13 >> 0] = HEAP8[$90 + 19 >> 0] | 0; //@line 10086
         HEAP8[$$090117$i + 14 >> 0] = HEAP8[$90 + 20 >> 0] | 0; //@line 10090
         HEAP8[$$090117$i + 15 >> 0] = HEAP8[$90 + 21 >> 0] | 0; //@line 10094
         HEAP8[$$090117$i + 16 >> 0] = HEAP8[$90 + 22 >> 0] | 0; //@line 10098
         HEAP8[$$090117$i + 17 >> 0] = HEAP8[$90 + 23 >> 0] | 0; //@line 10102
         HEAP8[$$090117$i + 18 >> 0] = HEAP8[$90 + 24 >> 0] | 0; //@line 10106
         HEAP8[$$090117$i + 19 >> 0] = HEAP8[$90 + 25 >> 0] | 0; //@line 10110
         $$0 = $90 + 26 | 0; //@line 10113
         $$1$i = $$090117$i + 20 | 0; //@line 10113
         $$196$i = $$095115$i + 1 | 0; //@line 10113
         break;
        } else {
         $$0 = $109 + $114 | 0; //@line 10117
         $$1$i = $$090117$i; //@line 10117
         $$196$i = $$095115$i; //@line 10117
         break;
        }
       }
      } while (0);
      $$094116$i = $$094116$i + 1 | 0; //@line 10122
      if (!(($$094116$i | 0) < ($51 | 0) & $$196$i >>> 0 < $6 >>> 0)) {
       $$089$i = $$196$i; //@line 10129
       break;
      } else {
       $$090117$i = $$1$i; //@line 10127
       $$095115$i = $$196$i; //@line 10127
       $74 = $$0; //@line 10127
      }
     }
    } else {
     $$089$i = 0; //@line 10134
    }
   } else {
    $$089$i = 0; //@line 10137
   }
   $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 10141
  }
 }
 _free($2); //@line 10144
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 10145
 $190 = __ZN6Socket5closeEv($4) | 0; //@line 10146
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 10149
  $191 = $ReallocAsyncCtx12 + 4 | 0; //@line 10150
  HEAP32[$191 >> 2] = $$355; //@line 10151
  $192 = $ReallocAsyncCtx12 + 8 | 0; //@line 10152
  HEAP32[$192 >> 2] = $8; //@line 10153
  $193 = $ReallocAsyncCtx12 + 12 | 0; //@line 10154
  HEAP32[$193 >> 2] = $26; //@line 10155
  sp = STACKTOP; //@line 10156
  return;
 }
 HEAP32[___async_retval >> 2] = $190; //@line 10160
 ___async_unwind = 0; //@line 10161
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 10162
 $191 = $ReallocAsyncCtx12 + 4 | 0; //@line 10163
 HEAP32[$191 >> 2] = $$355; //@line 10164
 $192 = $ReallocAsyncCtx12 + 8 | 0; //@line 10165
 HEAP32[$192 >> 2] = $8; //@line 10166
 $193 = $ReallocAsyncCtx12 + 12 | 0; //@line 10167
 HEAP32[$193 >> 2] = $26; //@line 10168
 sp = STACKTOP; //@line 10169
 return;
}
function _fmod($0, $1) {
 $0 = +$0;
 $1 = +$1;
 var $$070 = 0.0, $$071$lcssa = 0, $$07194 = 0, $$073$lcssa = 0, $$073100 = 0, $$172$ph = 0, $$174 = 0, $$275$lcssa = 0, $$27586 = 0, $$376$lcssa = 0, $$37683 = 0, $$lcssa = 0, $101 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $11 = 0, $110 = 0, $111 = 0, $116 = 0, $118 = 0, $12 = 0, $120 = 0, $123 = 0, $125 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $14 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $150 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $160 = 0, $18 = 0, $2 = 0, $20 = 0, $27 = 0.0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $41 = 0, $42 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $59 = 0, $6 = 0, $64 = 0, $65 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $82 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $97 = 0, $99 = 0, label = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2690
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2690
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2691
 HEAPF64[tempDoublePtr >> 3] = $1; //@line 2692
 $4 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2692
 $5 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2693
 $6 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 2694
 $8 = $6 & 2047; //@line 2696
 $9 = _bitshift64Lshr($4 | 0, $5 | 0, 52) | 0; //@line 2697
 $11 = $9 & 2047; //@line 2699
 $12 = $3 & -2147483648; //@line 2700
 $13 = _bitshift64Shl($4 | 0, $5 | 0, 1) | 0; //@line 2701
 $14 = tempRet0; //@line 2702
 L1 : do {
  if (($13 | 0) == 0 & ($14 | 0) == 0) {
   label = 3; //@line 2708
  } else {
   $18 = ___DOUBLE_BITS_563($1) | 0; //@line 2710
   $20 = tempRet0 & 2147483647; //@line 2712
   if (($8 | 0) == 2047 | ($20 >>> 0 > 2146435072 | ($20 | 0) == 2146435072 & $18 >>> 0 > 0)) {
    label = 3; //@line 2721
   } else {
    $29 = _bitshift64Shl($2 | 0, $3 | 0, 1) | 0; //@line 2723
    $30 = tempRet0; //@line 2724
    if (!($30 >>> 0 > $14 >>> 0 | ($30 | 0) == ($14 | 0) & $29 >>> 0 > $13 >>> 0)) {
     return +(($29 | 0) == ($13 | 0) & ($30 | 0) == ($14 | 0) ? $0 * 0.0 : $0);
    }
    if (!$8) {
     $41 = _bitshift64Shl($2 | 0, $3 | 0, 12) | 0; //@line 2740
     $42 = tempRet0; //@line 2741
     if (($42 | 0) > -1 | ($42 | 0) == -1 & $41 >>> 0 > 4294967295) {
      $$073100 = 0; //@line 2748
      $49 = $41; //@line 2748
      $50 = $42; //@line 2748
      while (1) {
       $48 = $$073100 + -1 | 0; //@line 2750
       $49 = _bitshift64Shl($49 | 0, $50 | 0, 1) | 0; //@line 2751
       $50 = tempRet0; //@line 2752
       if (!(($50 | 0) > -1 | ($50 | 0) == -1 & $49 >>> 0 > 4294967295)) {
        $$073$lcssa = $48; //@line 2761
        break;
       } else {
        $$073100 = $48; //@line 2759
       }
      }
     } else {
      $$073$lcssa = 0; //@line 2766
     }
     $59 = _bitshift64Shl($2 | 0, $3 | 0, 1 - $$073$lcssa | 0) | 0; //@line 2769
     $$174 = $$073$lcssa; //@line 2771
     $87 = $59; //@line 2771
     $88 = tempRet0; //@line 2771
    } else {
     $$174 = $8; //@line 2775
     $87 = $2; //@line 2775
     $88 = $3 & 1048575 | 1048576; //@line 2775
    }
    if (!$11) {
     $64 = _bitshift64Shl($4 | 0, $5 | 0, 12) | 0; //@line 2779
     $65 = tempRet0; //@line 2780
     if (($65 | 0) > -1 | ($65 | 0) == -1 & $64 >>> 0 > 4294967295) {
      $$07194 = 0; //@line 2787
      $72 = $64; //@line 2787
      $73 = $65; //@line 2787
      while (1) {
       $71 = $$07194 + -1 | 0; //@line 2789
       $72 = _bitshift64Shl($72 | 0, $73 | 0, 1) | 0; //@line 2790
       $73 = tempRet0; //@line 2791
       if (!(($73 | 0) > -1 | ($73 | 0) == -1 & $72 >>> 0 > 4294967295)) {
        $$071$lcssa = $71; //@line 2800
        break;
       } else {
        $$07194 = $71; //@line 2798
       }
      }
     } else {
      $$071$lcssa = 0; //@line 2805
     }
     $82 = _bitshift64Shl($4 | 0, $5 | 0, 1 - $$071$lcssa | 0) | 0; //@line 2808
     $$172$ph = $$071$lcssa; //@line 2810
     $89 = $82; //@line 2810
     $90 = tempRet0; //@line 2810
    } else {
     $$172$ph = $11; //@line 2814
     $89 = $4; //@line 2814
     $90 = $5 & 1048575 | 1048576; //@line 2814
    }
    $91 = _i64Subtract($87 | 0, $88 | 0, $89 | 0, $90 | 0) | 0; //@line 2817
    $92 = tempRet0; //@line 2818
    $97 = ($92 | 0) > -1 | ($92 | 0) == -1 & $91 >>> 0 > 4294967295; //@line 2823
    L23 : do {
     if (($$174 | 0) > ($$172$ph | 0)) {
      $$27586 = $$174; //@line 2826
      $101 = $92; //@line 2826
      $156 = $97; //@line 2826
      $157 = $87; //@line 2826
      $158 = $88; //@line 2826
      $99 = $91; //@line 2826
      while (1) {
       if ($156) {
        if (($99 | 0) == 0 & ($101 | 0) == 0) {
         break;
        } else {
         $104 = $99; //@line 2835
         $105 = $101; //@line 2835
        }
       } else {
        $104 = $157; //@line 2838
        $105 = $158; //@line 2838
       }
       $106 = _bitshift64Shl($104 | 0, $105 | 0, 1) | 0; //@line 2840
       $107 = tempRet0; //@line 2841
       $108 = $$27586 + -1 | 0; //@line 2842
       $110 = _i64Subtract($106 | 0, $107 | 0, $89 | 0, $90 | 0) | 0; //@line 2844
       $111 = tempRet0; //@line 2845
       $116 = ($111 | 0) > -1 | ($111 | 0) == -1 & $110 >>> 0 > 4294967295; //@line 2850
       if (($108 | 0) > ($$172$ph | 0)) {
        $$27586 = $108; //@line 2852
        $101 = $111; //@line 2852
        $156 = $116; //@line 2852
        $157 = $106; //@line 2852
        $158 = $107; //@line 2852
        $99 = $110; //@line 2852
       } else {
        $$275$lcssa = $108; //@line 2854
        $$lcssa = $116; //@line 2854
        $118 = $110; //@line 2854
        $120 = $111; //@line 2854
        $159 = $106; //@line 2854
        $160 = $107; //@line 2854
        break L23;
       }
      }
      $$070 = $0 * 0.0; //@line 2859
      break L1;
     } else {
      $$275$lcssa = $$174; //@line 2862
      $$lcssa = $97; //@line 2862
      $118 = $91; //@line 2862
      $120 = $92; //@line 2862
      $159 = $87; //@line 2862
      $160 = $88; //@line 2862
     }
    } while (0);
    if ($$lcssa) {
     if (($118 | 0) == 0 & ($120 | 0) == 0) {
      $$070 = $0 * 0.0; //@line 2871
      break;
     } else {
      $123 = $120; //@line 2874
      $125 = $118; //@line 2874
     }
    } else {
     $123 = $160; //@line 2877
     $125 = $159; //@line 2877
    }
    if ($123 >>> 0 < 1048576 | ($123 | 0) == 1048576 & $125 >>> 0 < 0) {
     $$37683 = $$275$lcssa; //@line 2885
     $130 = $125; //@line 2885
     $131 = $123; //@line 2885
     while (1) {
      $132 = _bitshift64Shl($130 | 0, $131 | 0, 1) | 0; //@line 2887
      $133 = tempRet0; //@line 2888
      $134 = $$37683 + -1 | 0; //@line 2889
      if ($133 >>> 0 < 1048576 | ($133 | 0) == 1048576 & $132 >>> 0 < 0) {
       $$37683 = $134; //@line 2896
       $130 = $132; //@line 2896
       $131 = $133; //@line 2896
      } else {
       $$376$lcssa = $134; //@line 2898
       $141 = $132; //@line 2898
       $142 = $133; //@line 2898
       break;
      }
     }
    } else {
     $$376$lcssa = $$275$lcssa; //@line 2903
     $141 = $125; //@line 2903
     $142 = $123; //@line 2903
    }
    if (($$376$lcssa | 0) > 0) {
     $143 = _i64Add($141 | 0, $142 | 0, 0, -1048576) | 0; //@line 2907
     $144 = tempRet0; //@line 2908
     $145 = _bitshift64Shl($$376$lcssa | 0, 0, 52) | 0; //@line 2909
     $153 = $144 | tempRet0; //@line 2913
     $154 = $143 | $145; //@line 2913
    } else {
     $150 = _bitshift64Lshr($141 | 0, $142 | 0, 1 - $$376$lcssa | 0) | 0; //@line 2916
     $153 = tempRet0; //@line 2918
     $154 = $150; //@line 2918
    }
    HEAP32[tempDoublePtr >> 2] = $154; //@line 2921
    HEAP32[tempDoublePtr + 4 >> 2] = $153 | $12; //@line 2921
    $$070 = +HEAPF64[tempDoublePtr >> 3]; //@line 2922
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $27 = $0 * $1; //@line 2927
  $$070 = $27 / $27; //@line 2929
 }
 return +$$070;
}
function __ZN13SocketAddress14set_ip_addressEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$016$i = 0, $$025$i = 0, $$02537$i = 0, $$026$i = 0, $$02636$i = 0, $$1$1$i = 0, $$1$2$i = 0, $$1$3$i = 0, $$1$i = 0, $$pre$phi$iZ2D = 0, $103 = 0, $110 = 0, $117 = 0, $124 = 0, $130 = 0, $2 = 0, $25 = 0, $33 = 0, $4 = 0, $42 = 0, $52 = 0, $6 = 0, $62 = 0, $65 = 0, $72 = 0, $76 = 0, $82 = 0, $89 = 0, $9 = 0, $96 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1718
 STACKTOP = STACKTOP + 48 | 0; //@line 1719
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1719
 $vararg_buffer7 = sp + 24 | 0; //@line 1720
 $vararg_buffer4 = sp + 16 | 0; //@line 1721
 $vararg_buffer1 = sp + 8 | 0; //@line 1722
 $vararg_buffer = sp; //@line 1723
 $2 = sp + 32 | 0; //@line 1724
 HEAP8[$0 >> 0] = 0; //@line 1725
 L1 : do {
  if ($1 | 0) {
   $4 = HEAP8[$1 >> 0] | 0; //@line 1729
   do {
    if ($4 << 24 >> 24) {
     $$016$i = 0; //@line 1733
     $6 = $4; //@line 1733
     while (1) {
      if (!($6 << 24 >> 24 == 46 | ($6 + -48 & 255) < 10)) {
       $$02537$i = 0; //@line 1740
       $$02636$i = 0; //@line 1740
       $52 = $4; //@line 1740
       break;
      }
      $9 = $$016$i + 1 | 0; //@line 1743
      $6 = HEAP8[$1 + $9 >> 0] | 0; //@line 1745
      if (!($6 << 24 >> 24)) {
       label = 5; //@line 1748
       break;
      } else {
       $$016$i = $9; //@line 1751
      }
     }
     if ((label | 0) == 5) {
      if (($$016$i | 0) <= -1) {
       break;
      }
      if ((HEAP8[$1 + $$016$i >> 0] | 0) == 46) {
       $$02537$i = 0; //@line 1763
       $$02636$i = 0; //@line 1763
       $52 = $4; //@line 1763
      } else {
       break;
      }
     }
     do {
      if (!(($52 + -48 & 255) < 10 | ($52 + -97 & 255) < 6)) {
       switch ($52 << 24 >> 24) {
       case 58:
       case 65:
       case 66:
       case 67:
       case 68:
       case 69:
       case 70:
        {
         break;
        }
       default:
        {
         break L1;
        }
       }
      }
      $$02636$i = $$02636$i + ($52 << 24 >> 24 == 58 & 1) | 0; //@line 1786
      $$02537$i = $$02537$i + 1 | 0; //@line 1787
      $52 = HEAP8[$1 + $$02537$i >> 0] | 0; //@line 1789
     } while ($52 << 24 >> 24 != 0);
     if (($$02636$i | 0) <= 1) {
      break L1;
     }
     HEAP32[$0 + 40 >> 2] = 2; //@line 1802
     $62 = $0 + 44 | 0; //@line 1803
     $$025$i = 0; //@line 1804
     L17 : while (1) {
      switch (HEAP8[$1 + $$025$i >> 0] | 0) {
      case 0:
       {
        label = 34; //@line 1810
        break L17;
        break;
       }
      case 58:
       {
        $65 = $$025$i + 1 | 0; //@line 1815
        if ((HEAP8[$1 + $65 >> 0] | 0) == 58) {
         label = 33; //@line 1820
         break L17;
        } else {
         $$025$i = $65; //@line 1823
         continue L17;
        }
        break;
       }
      default:
       {
        $$025$i = $$025$i + 1 | 0; //@line 1830
        continue L17;
       }
      }
     }
     if ((label | 0) == 33) {
      $$026$i = __ZL15ipv6_scan_chunkPtPKc($2, $1 + ($$025$i + 2) | 0) | 0; //@line 1839
      $$pre$phi$iZ2D = $2; //@line 1839
     } else if ((label | 0) == 34) {
      $$026$i = 0; //@line 1842
      $$pre$phi$iZ2D = $2; //@line 1842
     }
     $72 = 8 - $$026$i | 0; //@line 1844
     _memmove($2 + ($72 << 1) | 0, $2 | 0, $$026$i << 1 | 0) | 0; //@line 1847
     _memset($2 | 0, 0, $72 << 1 | 0) | 0; //@line 1849
     __ZL15ipv6_scan_chunkPtPKc($$pre$phi$iZ2D, $1) | 0; //@line 1850
     $76 = HEAP16[$$pre$phi$iZ2D >> 1] | 0; //@line 1851
     HEAP8[$62 >> 0] = ($76 & 65535) >>> 8; //@line 1854
     HEAP8[$0 + 45 >> 0] = $76; //@line 1857
     $82 = HEAP16[$2 + 2 >> 1] | 0; //@line 1859
     HEAP8[$0 + 46 >> 0] = ($82 & 65535) >>> 8; //@line 1863
     HEAP8[$0 + 47 >> 0] = $82; //@line 1866
     $89 = HEAP16[$2 + 4 >> 1] | 0; //@line 1868
     HEAP8[$0 + 48 >> 0] = ($89 & 65535) >>> 8; //@line 1872
     HEAP8[$0 + 49 >> 0] = $89; //@line 1875
     $96 = HEAP16[$2 + 6 >> 1] | 0; //@line 1877
     HEAP8[$0 + 50 >> 0] = ($96 & 65535) >>> 8; //@line 1881
     HEAP8[$0 + 51 >> 0] = $96; //@line 1884
     $103 = HEAP16[$2 + 8 >> 1] | 0; //@line 1886
     HEAP8[$0 + 52 >> 0] = ($103 & 65535) >>> 8; //@line 1890
     HEAP8[$0 + 53 >> 0] = $103; //@line 1893
     $110 = HEAP16[$2 + 10 >> 1] | 0; //@line 1895
     HEAP8[$0 + 54 >> 0] = ($110 & 65535) >>> 8; //@line 1899
     HEAP8[$0 + 55 >> 0] = $110; //@line 1902
     $117 = HEAP16[$2 + 12 >> 1] | 0; //@line 1904
     HEAP8[$0 + 56 >> 0] = ($117 & 65535) >>> 8; //@line 1908
     HEAP8[$0 + 57 >> 0] = $117; //@line 1911
     $124 = HEAP16[$2 + 14 >> 1] | 0; //@line 1913
     HEAP8[$0 + 58 >> 0] = ($124 & 65535) >>> 8; //@line 1917
     HEAP8[$0 + 59 >> 0] = $124; //@line 1920
     $$0 = 1; //@line 1921
     STACKTOP = sp; //@line 1922
     return $$0 | 0; //@line 1922
    }
   } while (0);
   HEAP32[$0 + 40 >> 2] = 1; //@line 1926
   HEAP32[$vararg_buffer >> 2] = $2; //@line 1927
   L28 : do {
    if ((_sscanf($1, 2253, $vararg_buffer) | 0) >= 1) {
     HEAP8[$0 + 44 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1934
     $$1$i = 0; //@line 1935
     L30 : while (1) {
      switch (HEAP8[$1 + $$1$i >> 0] | 0) {
      case 0:
       {
        break L28;
        break;
       }
      case 46:
       {
        break L30;
        break;
       }
      default:
       {}
      }
      $$1$i = $$1$i + 1 | 0; //@line 1952
     }
     $25 = $$1$i + 1 | 0; //@line 1954
     HEAP32[$vararg_buffer1 >> 2] = $2; //@line 1956
     if ((_sscanf($1 + $25 | 0, 2253, $vararg_buffer1) | 0) >= 1) {
      HEAP8[$0 + 45 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1962
      $$1$1$i = $25; //@line 1963
      L35 : while (1) {
       switch (HEAP8[$1 + $$1$1$i >> 0] | 0) {
       case 0:
        {
         break L28;
         break;
        }
       case 46:
        {
         break L35;
         break;
        }
       default:
        {}
       }
       $$1$1$i = $$1$1$i + 1 | 0; //@line 1980
      }
      $33 = $$1$1$i + 1 | 0; //@line 1982
      HEAP32[$vararg_buffer4 >> 2] = $2; //@line 1984
      if ((_sscanf($1 + $33 | 0, 2253, $vararg_buffer4) | 0) >= 1) {
       HEAP8[$0 + 46 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1990
       $$1$2$i = $33; //@line 1991
       L40 : while (1) {
        switch (HEAP8[$1 + $$1$2$i >> 0] | 0) {
        case 0:
         {
          break L28;
          break;
         }
        case 46:
         {
          break L40;
          break;
         }
        default:
         {}
        }
        $$1$2$i = $$1$2$i + 1 | 0; //@line 2008
       }
       $42 = $$1$2$i + 1 | 0; //@line 2010
       HEAP32[$vararg_buffer7 >> 2] = $2; //@line 2012
       if ((_sscanf($1 + $42 | 0, 2253, $vararg_buffer7) | 0) >= 1) {
        HEAP8[$0 + 47 >> 0] = HEAP8[$2 >> 0] | 0; //@line 2018
        $$1$3$i = $42; //@line 2019
        L45 : while (1) {
         switch (HEAP8[$1 + $$1$3$i >> 0] | 0) {
         case 0:
          {
           break L28;
           break;
          }
         case 46:
          {
           break L45;
           break;
          }
         default:
          {}
         }
         $$1$3$i = $$1$3$i + 1 | 0; //@line 2036
        }
        $$0 = 1; //@line 2038
        STACKTOP = sp; //@line 2039
        return $$0 | 0; //@line 2039
       }
      }
     }
    }
   } while (0);
   $$0 = 1; //@line 2045
   STACKTOP = sp; //@line 2046
   return $$0 | 0; //@line 2046
  }
 } while (0);
 $130 = $0 + 40 | 0; //@line 2049
 HEAP32[$130 >> 2] = 0; //@line 2050
 HEAP32[$130 + 4 >> 2] = 0; //@line 2050
 HEAP32[$130 + 8 >> 2] = 0; //@line 2050
 HEAP32[$130 + 12 >> 2] = 0; //@line 2050
 HEAP32[$130 + 16 >> 2] = 0; //@line 2050
 $$0 = 0; //@line 2051
 STACKTOP = sp; //@line 2052
 return $$0 | 0; //@line 2052
}
function __ZN6Socket4openEP12NetworkStack($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$1 = 0, $$pre = 0, $$pre$i$i = 0, $10 = 0, $13 = 0, $14 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $35 = 0, $38 = 0, $4 = 0, $48 = 0, $49 = 0, $60 = 0, $61 = 0, $67 = 0, $70 = 0, $71 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1284
 STACKTOP = STACKTOP + 32 | 0; //@line 1285
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1285
 $2 = sp + 16 | 0; //@line 1286
 $3 = sp; //@line 1287
 $4 = $0 + 4 | 0; //@line 1288
 if (($1 | 0) == 0 | (HEAP32[$4 >> 2] | 0) != 0) {
  $$1 = -3003; //@line 1294
  STACKTOP = sp; //@line 1295
  return $$1 | 0; //@line 1295
 }
 HEAP32[$4 >> 2] = $1; //@line 1297
 $10 = HEAP32[(HEAP32[$1 >> 2] | 0) + 28 >> 2] | 0; //@line 1300
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 1303
 $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 1304
 $14 = FUNCTION_TABLE_ii[$13 & 15]($0) | 0; //@line 1305
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1308
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1310
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1312
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1314
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1316
  HEAP32[$AsyncCtx + 20 >> 2] = $10; //@line 1318
  HEAP32[$AsyncCtx + 24 >> 2] = $4; //@line 1320
  HEAP32[$AsyncCtx + 28 >> 2] = $2; //@line 1322
  sp = STACKTOP; //@line 1323
  STACKTOP = sp; //@line 1324
  return 0; //@line 1324
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1326
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1327
 $22 = FUNCTION_TABLE_iiii[$10 & 15]($1, $2, $14) | 0; //@line 1328
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 57; //@line 1331
  HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1333
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1335
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1337
  HEAP32[$AsyncCtx2 + 16 >> 2] = $4; //@line 1339
  HEAP32[$AsyncCtx2 + 20 >> 2] = $2; //@line 1341
  sp = STACKTOP; //@line 1342
  STACKTOP = sp; //@line 1343
  return 0; //@line 1343
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1345
 do {
  if (!$22) {
   $30 = $0 + 8 | 0; //@line 1350
   HEAP32[$30 >> 2] = HEAP32[$2 >> 2]; //@line 1351
   $31 = $3 + 12 | 0; //@line 1352
   HEAP32[$3 >> 2] = 12; //@line 1353
   HEAP32[$3 + 4 >> 2] = 1; //@line 1355
   HEAP32[$3 + 8 >> 2] = $0; //@line 1357
   HEAP32[$31 >> 2] = 420; //@line 1358
   $32 = $0 + 16 | 0; //@line 1359
   do {
    if (($32 | 0) == ($3 | 0)) {
     $60 = 420; //@line 1363
     label = 16; //@line 1364
    } else {
     $34 = $0 + 28 | 0; //@line 1366
     $35 = HEAP32[$34 >> 2] | 0; //@line 1367
     if (!$35) {
      $48 = 420; //@line 1370
     } else {
      $38 = HEAP32[$35 + 8 >> 2] | 0; //@line 1373
      $AsyncCtx5 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1374
      FUNCTION_TABLE_vi[$38 & 255]($32); //@line 1375
      if (___async) {
       HEAP32[$AsyncCtx5 >> 2] = 58; //@line 1378
       HEAP32[$AsyncCtx5 + 4 >> 2] = $31; //@line 1380
       HEAP32[$AsyncCtx5 + 8 >> 2] = $34; //@line 1382
       HEAP32[$AsyncCtx5 + 12 >> 2] = $32; //@line 1384
       HEAP32[$AsyncCtx5 + 16 >> 2] = $3; //@line 1386
       HEAP32[$AsyncCtx5 + 20 >> 2] = $4; //@line 1388
       HEAP32[$AsyncCtx5 + 24 >> 2] = $30; //@line 1390
       HEAP32[$AsyncCtx5 + 28 >> 2] = $2; //@line 1392
       sp = STACKTOP; //@line 1393
       STACKTOP = sp; //@line 1394
       return 0; //@line 1394
      }
      _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1396
      $$pre = HEAP32[$31 >> 2] | 0; //@line 1397
      if (!$$pre) {
       HEAP32[$34 >> 2] = 0; //@line 1400
       break;
      } else {
       $48 = $$pre; //@line 1403
      }
     }
     $49 = HEAP32[$48 + 4 >> 2] | 0; //@line 1407
     $AsyncCtx8 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1408
     FUNCTION_TABLE_vii[$49 & 3]($32, $3); //@line 1409
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 59; //@line 1412
      HEAP32[$AsyncCtx8 + 4 >> 2] = $31; //@line 1414
      HEAP32[$AsyncCtx8 + 8 >> 2] = $34; //@line 1416
      HEAP32[$AsyncCtx8 + 12 >> 2] = $3; //@line 1418
      HEAP32[$AsyncCtx8 + 16 >> 2] = $4; //@line 1420
      HEAP32[$AsyncCtx8 + 20 >> 2] = $30; //@line 1422
      HEAP32[$AsyncCtx8 + 24 >> 2] = $32; //@line 1424
      HEAP32[$AsyncCtx8 + 28 >> 2] = $2; //@line 1426
      sp = STACKTOP; //@line 1427
      STACKTOP = sp; //@line 1428
      return 0; //@line 1428
     } else {
      _emscripten_free_async_context($AsyncCtx8 | 0); //@line 1430
      $$pre$i$i = HEAP32[$31 >> 2] | 0; //@line 1431
      HEAP32[$34 >> 2] = $$pre$i$i; //@line 1433
      if (!$$pre$i$i) {
       break;
      } else {
       $60 = $$pre$i$i; //@line 1438
       label = 16; //@line 1439
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 16) {
     $61 = HEAP32[$60 + 8 >> 2] | 0; //@line 1448
     $AsyncCtx11 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1449
     FUNCTION_TABLE_vi[$61 & 255]($3); //@line 1450
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 60; //@line 1453
      HEAP32[$AsyncCtx11 + 4 >> 2] = $3; //@line 1455
      HEAP32[$AsyncCtx11 + 8 >> 2] = $4; //@line 1457
      HEAP32[$AsyncCtx11 + 12 >> 2] = $30; //@line 1459
      HEAP32[$AsyncCtx11 + 16 >> 2] = $32; //@line 1461
      HEAP32[$AsyncCtx11 + 20 >> 2] = $2; //@line 1463
      sp = STACKTOP; //@line 1464
      STACKTOP = sp; //@line 1465
      return 0; //@line 1465
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1467
      break;
     }
    }
   } while (0);
   $67 = HEAP32[$4 >> 2] | 0; //@line 1472
   $70 = HEAP32[(HEAP32[$67 >> 2] | 0) + 68 >> 2] | 0; //@line 1475
   $71 = HEAP32[$30 >> 2] | 0; //@line 1476
   $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1477
   FUNCTION_TABLE_viiii[$70 & 7]($67, $71, 61, $32); //@line 1478
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 62; //@line 1481
    HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 1483
    sp = STACKTOP; //@line 1484
    STACKTOP = sp; //@line 1485
    return 0; //@line 1485
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 1487
    $$0 = 0; //@line 1488
    break;
   }
  } else {
   $$0 = $22; //@line 1492
  }
 } while (0);
 $$1 = $$0; //@line 1495
 STACKTOP = sp; //@line 1496
 return $$1 | 0; //@line 1496
}
function __ZL15ipv6_scan_chunkPtPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1$ph = 0, $$124 = 0, $$124$1 = 0, $$124$2 = 0, $$124$3 = 0, $$124$4 = 0, $$124$5 = 0, $$124$6 = 0, $$124$7 = 0, $$2 = 0, $17 = 0, $2 = 0, $26 = 0, $35 = 0, $44 = 0, $53 = 0, $62 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer10 = 0, $vararg_buffer13 = 0, $vararg_buffer16 = 0, $vararg_buffer19 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 2062
 STACKTOP = STACKTOP + 64 | 0; //@line 2063
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 2063
 $vararg_buffer19 = sp + 56 | 0; //@line 2064
 $vararg_buffer16 = sp + 48 | 0; //@line 2065
 $vararg_buffer13 = sp + 40 | 0; //@line 2066
 $vararg_buffer10 = sp + 32 | 0; //@line 2067
 $vararg_buffer7 = sp + 24 | 0; //@line 2068
 $vararg_buffer4 = sp + 16 | 0; //@line 2069
 $vararg_buffer1 = sp + 8 | 0; //@line 2070
 $vararg_buffer = sp; //@line 2071
 $2 = sp + 60 | 0; //@line 2072
 HEAP32[$vararg_buffer >> 2] = $2; //@line 2073
 L1 : do {
  if ((_sscanf($1, 2258, $vararg_buffer) | 0) < 1) {
   $$1$ph = 0; //@line 2078
  } else {
   HEAP16[$0 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2081
   $$124 = 0; //@line 2082
   L3 : while (1) {
    switch (HEAP8[$1 + $$124 >> 0] | 0) {
    case 0:
     {
      $$1$ph = 1; //@line 2088
      break L1;
      break;
     }
    case 58:
     {
      break L3;
      break;
     }
    default:
     {}
    }
    $$124 = $$124 + 1 | 0; //@line 2100
   }
   $9 = $$124 + 1 | 0; //@line 2102
   HEAP32[$vararg_buffer1 >> 2] = $2; //@line 2104
   if ((_sscanf($1 + $9 | 0, 2258, $vararg_buffer1) | 0) < 1) {
    $$1$ph = 1; //@line 2108
   } else {
    HEAP16[$0 + 2 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2112
    $$124$1 = $9; //@line 2113
    L8 : while (1) {
     switch (HEAP8[$1 + $$124$1 >> 0] | 0) {
     case 0:
      {
       $$1$ph = 2; //@line 2119
       break L1;
       break;
      }
     case 58:
      {
       break L8;
       break;
      }
     default:
      {}
     }
     $$124$1 = $$124$1 + 1 | 0; //@line 2131
    }
    $17 = $$124$1 + 1 | 0; //@line 2133
    HEAP32[$vararg_buffer4 >> 2] = $2; //@line 2135
    if ((_sscanf($1 + $17 | 0, 2258, $vararg_buffer4) | 0) < 1) {
     $$1$ph = 2; //@line 2139
    } else {
     HEAP16[$0 + 4 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2143
     $$124$2 = $17; //@line 2144
     L13 : while (1) {
      switch (HEAP8[$1 + $$124$2 >> 0] | 0) {
      case 0:
       {
        $$1$ph = 3; //@line 2150
        break L1;
        break;
       }
      case 58:
       {
        break L13;
        break;
       }
      default:
       {}
      }
      $$124$2 = $$124$2 + 1 | 0; //@line 2162
     }
     $26 = $$124$2 + 1 | 0; //@line 2164
     HEAP32[$vararg_buffer7 >> 2] = $2; //@line 2166
     if ((_sscanf($1 + $26 | 0, 2258, $vararg_buffer7) | 0) < 1) {
      $$1$ph = 3; //@line 2170
     } else {
      HEAP16[$0 + 6 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2174
      $$124$3 = $26; //@line 2175
      L18 : while (1) {
       switch (HEAP8[$1 + $$124$3 >> 0] | 0) {
       case 0:
        {
         $$1$ph = 4; //@line 2181
         break L1;
         break;
        }
       case 58:
        {
         break L18;
         break;
        }
       default:
        {}
       }
       $$124$3 = $$124$3 + 1 | 0; //@line 2193
      }
      $35 = $$124$3 + 1 | 0; //@line 2195
      HEAP32[$vararg_buffer10 >> 2] = $2; //@line 2197
      if ((_sscanf($1 + $35 | 0, 2258, $vararg_buffer10) | 0) < 1) {
       $$1$ph = 4; //@line 2201
      } else {
       HEAP16[$0 + 8 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2205
       $$124$4 = $35; //@line 2206
       L23 : while (1) {
        switch (HEAP8[$1 + $$124$4 >> 0] | 0) {
        case 0:
         {
          $$1$ph = 5; //@line 2212
          break L1;
          break;
         }
        case 58:
         {
          break L23;
          break;
         }
        default:
         {}
        }
        $$124$4 = $$124$4 + 1 | 0; //@line 2224
       }
       $44 = $$124$4 + 1 | 0; //@line 2226
       HEAP32[$vararg_buffer13 >> 2] = $2; //@line 2228
       if ((_sscanf($1 + $44 | 0, 2258, $vararg_buffer13) | 0) < 1) {
        $$1$ph = 5; //@line 2232
       } else {
        HEAP16[$0 + 10 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2236
        $$124$5 = $44; //@line 2237
        L28 : while (1) {
         switch (HEAP8[$1 + $$124$5 >> 0] | 0) {
         case 0:
          {
           $$1$ph = 6; //@line 2243
           break L1;
           break;
          }
         case 58:
          {
           break L28;
           break;
          }
         default:
          {}
         }
         $$124$5 = $$124$5 + 1 | 0; //@line 2255
        }
        $53 = $$124$5 + 1 | 0; //@line 2257
        HEAP32[$vararg_buffer16 >> 2] = $2; //@line 2259
        if ((_sscanf($1 + $53 | 0, 2258, $vararg_buffer16) | 0) < 1) {
         $$1$ph = 6; //@line 2263
        } else {
         HEAP16[$0 + 12 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2267
         $$124$6 = $53; //@line 2268
         L33 : while (1) {
          switch (HEAP8[$1 + $$124$6 >> 0] | 0) {
          case 0:
           {
            $$1$ph = 7; //@line 2274
            break L1;
            break;
           }
          case 58:
           {
            break L33;
            break;
           }
          default:
           {}
          }
          $$124$6 = $$124$6 + 1 | 0; //@line 2286
         }
         $62 = $$124$6 + 1 | 0; //@line 2288
         HEAP32[$vararg_buffer19 >> 2] = $2; //@line 2290
         if ((_sscanf($1 + $62 | 0, 2258, $vararg_buffer19) | 0) < 1) {
          $$1$ph = 7; //@line 2294
         } else {
          HEAP16[$0 + 14 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2298
          $$124$7 = $62; //@line 2299
          L38 : while (1) {
           switch (HEAP8[$1 + $$124$7 >> 0] | 0) {
           case 0:
            {
             $$1$ph = 8; //@line 2305
             break L1;
             break;
            }
           case 58:
            {
             break L38;
             break;
            }
           default:
            {}
           }
           $$124$7 = $$124$7 + 1 | 0; //@line 2317
          }
          $$2 = 8; //@line 2319
          STACKTOP = sp; //@line 2320
          return $$2 | 0; //@line 2320
         }
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 $$2 = $$1$ph; //@line 2330
 STACKTOP = sp; //@line 2331
 return $$2 | 0; //@line 2331
}
function __ZN6Socket4openEP12NetworkStack__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 994
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 996
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 998
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1000
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1002
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1004
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1006
 if ($AsyncRetVal | 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1010
  return;
 }
 $14 = $4 + 8 | 0; //@line 1014
 HEAP32[$14 >> 2] = HEAP32[$2 >> 2]; //@line 1015
 $15 = $6 + 12 | 0; //@line 1016
 HEAP32[$6 >> 2] = 12; //@line 1017
 HEAP32[$6 + 4 >> 2] = 1; //@line 1019
 HEAP32[$6 + 8 >> 2] = $4; //@line 1021
 HEAP32[$15 >> 2] = 420; //@line 1022
 $16 = $4 + 16 | 0; //@line 1023
 if (($16 | 0) == ($6 | 0)) {
  $40 = HEAP32[107] | 0; //@line 1027
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 1028
  FUNCTION_TABLE_vi[$40 & 255]($6); //@line 1029
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 60; //@line 1032
   $41 = $ReallocAsyncCtx5 + 4 | 0; //@line 1033
   HEAP32[$41 >> 2] = $6; //@line 1034
   $42 = $ReallocAsyncCtx5 + 8 | 0; //@line 1035
   HEAP32[$42 >> 2] = $8; //@line 1036
   $43 = $ReallocAsyncCtx5 + 12 | 0; //@line 1037
   HEAP32[$43 >> 2] = $14; //@line 1038
   $44 = $ReallocAsyncCtx5 + 16 | 0; //@line 1039
   HEAP32[$44 >> 2] = $16; //@line 1040
   $45 = $ReallocAsyncCtx5 + 20 | 0; //@line 1041
   HEAP32[$45 >> 2] = $10; //@line 1042
   sp = STACKTOP; //@line 1043
   return;
  }
  ___async_unwind = 0; //@line 1046
  HEAP32[$ReallocAsyncCtx5 >> 2] = 60; //@line 1047
  $41 = $ReallocAsyncCtx5 + 4 | 0; //@line 1048
  HEAP32[$41 >> 2] = $6; //@line 1049
  $42 = $ReallocAsyncCtx5 + 8 | 0; //@line 1050
  HEAP32[$42 >> 2] = $8; //@line 1051
  $43 = $ReallocAsyncCtx5 + 12 | 0; //@line 1052
  HEAP32[$43 >> 2] = $14; //@line 1053
  $44 = $ReallocAsyncCtx5 + 16 | 0; //@line 1054
  HEAP32[$44 >> 2] = $16; //@line 1055
  $45 = $ReallocAsyncCtx5 + 20 | 0; //@line 1056
  HEAP32[$45 >> 2] = $10; //@line 1057
  sp = STACKTOP; //@line 1058
  return;
 }
 $18 = $4 + 28 | 0; //@line 1061
 $19 = HEAP32[$18 >> 2] | 0; //@line 1062
 if (!$19) {
  $31 = HEAP32[106] | 0; //@line 1066
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1067
  FUNCTION_TABLE_vii[$31 & 3]($16, $6); //@line 1068
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 59; //@line 1071
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 1072
   HEAP32[$32 >> 2] = $15; //@line 1073
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 1074
   HEAP32[$33 >> 2] = $18; //@line 1075
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 1076
   HEAP32[$34 >> 2] = $6; //@line 1077
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 1078
   HEAP32[$35 >> 2] = $8; //@line 1079
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 1080
   HEAP32[$36 >> 2] = $14; //@line 1081
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 1082
   HEAP32[$37 >> 2] = $16; //@line 1083
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 1084
   HEAP32[$38 >> 2] = $10; //@line 1085
   sp = STACKTOP; //@line 1086
   return;
  }
  ___async_unwind = 0; //@line 1089
  HEAP32[$ReallocAsyncCtx4 >> 2] = 59; //@line 1090
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 1091
  HEAP32[$32 >> 2] = $15; //@line 1092
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 1093
  HEAP32[$33 >> 2] = $18; //@line 1094
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 1095
  HEAP32[$34 >> 2] = $6; //@line 1096
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 1097
  HEAP32[$35 >> 2] = $8; //@line 1098
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 1099
  HEAP32[$36 >> 2] = $14; //@line 1100
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 1101
  HEAP32[$37 >> 2] = $16; //@line 1102
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 1103
  HEAP32[$38 >> 2] = $10; //@line 1104
  sp = STACKTOP; //@line 1105
  return;
 } else {
  $22 = HEAP32[$19 + 8 >> 2] | 0; //@line 1109
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 1110
  FUNCTION_TABLE_vi[$22 & 255]($16); //@line 1111
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 58; //@line 1114
   $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 1115
   HEAP32[$23 >> 2] = $15; //@line 1116
   $24 = $ReallocAsyncCtx3 + 8 | 0; //@line 1117
   HEAP32[$24 >> 2] = $18; //@line 1118
   $25 = $ReallocAsyncCtx3 + 12 | 0; //@line 1119
   HEAP32[$25 >> 2] = $16; //@line 1120
   $26 = $ReallocAsyncCtx3 + 16 | 0; //@line 1121
   HEAP32[$26 >> 2] = $6; //@line 1122
   $27 = $ReallocAsyncCtx3 + 20 | 0; //@line 1123
   HEAP32[$27 >> 2] = $8; //@line 1124
   $28 = $ReallocAsyncCtx3 + 24 | 0; //@line 1125
   HEAP32[$28 >> 2] = $14; //@line 1126
   $29 = $ReallocAsyncCtx3 + 28 | 0; //@line 1127
   HEAP32[$29 >> 2] = $10; //@line 1128
   sp = STACKTOP; //@line 1129
   return;
  }
  ___async_unwind = 0; //@line 1132
  HEAP32[$ReallocAsyncCtx3 >> 2] = 58; //@line 1133
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 1134
  HEAP32[$23 >> 2] = $15; //@line 1135
  $24 = $ReallocAsyncCtx3 + 8 | 0; //@line 1136
  HEAP32[$24 >> 2] = $18; //@line 1137
  $25 = $ReallocAsyncCtx3 + 12 | 0; //@line 1138
  HEAP32[$25 >> 2] = $16; //@line 1139
  $26 = $ReallocAsyncCtx3 + 16 | 0; //@line 1140
  HEAP32[$26 >> 2] = $6; //@line 1141
  $27 = $ReallocAsyncCtx3 + 20 | 0; //@line 1142
  HEAP32[$27 >> 2] = $8; //@line 1143
  $28 = $ReallocAsyncCtx3 + 24 | 0; //@line 1144
  HEAP32[$28 >> 2] = $14; //@line 1145
  $29 = $ReallocAsyncCtx3 + 28 | 0; //@line 1146
  HEAP32[$29 >> 2] = $10; //@line 1147
  sp = STACKTOP; //@line 1148
  return;
 }
}
function __ZNK13SocketAddress14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $11 = 0, $14 = 0, $17 = 0, $2 = 0, $23 = 0, $31 = 0, $39 = 0, $47 = 0, $55 = 0, $63 = 0, $71 = 0, $79 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer16 = 0, $vararg_buffer20 = 0, $vararg_buffer24 = 0, $vararg_buffer28 = 0, $vararg_buffer32 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 2358
 STACKTOP = STACKTOP + 80 | 0; //@line 2359
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(80); //@line 2359
 $vararg_buffer32 = sp + 72 | 0; //@line 2360
 $vararg_buffer28 = sp + 64 | 0; //@line 2361
 $vararg_buffer24 = sp + 56 | 0; //@line 2362
 $vararg_buffer20 = sp + 48 | 0; //@line 2363
 $vararg_buffer16 = sp + 40 | 0; //@line 2364
 $vararg_buffer12 = sp + 32 | 0; //@line 2365
 $vararg_buffer8 = sp + 24 | 0; //@line 2366
 $vararg_buffer4 = sp + 16 | 0; //@line 2367
 $vararg_buffer = sp; //@line 2368
 $2 = HEAP32[$0 + 40 >> 2] | 0; //@line 2370
 if (!$2) {
  $$0 = 0; //@line 2373
  STACKTOP = sp; //@line 2374
  return $$0 | 0; //@line 2374
 }
 if (HEAP8[$0 >> 0] | 0) {
  $$0 = $0; //@line 2379
  STACKTOP = sp; //@line 2380
  return $$0 | 0; //@line 2380
 }
 switch ($2 | 0) {
 case 1:
  {
   $11 = HEAPU8[$0 + 45 >> 0] | 0; //@line 2389
   $14 = HEAPU8[$0 + 46 >> 0] | 0; //@line 2392
   $17 = HEAPU8[$0 + 47 >> 0] | 0; //@line 2395
   HEAP32[$vararg_buffer >> 2] = HEAPU8[$0 + 44 >> 0]; //@line 2396
   HEAP32[$vararg_buffer + 4 >> 2] = $11; //@line 2398
   HEAP32[$vararg_buffer + 8 >> 2] = $14; //@line 2400
   HEAP32[$vararg_buffer + 12 >> 2] = $17; //@line 2402
   _sprintf($0, 2262, $vararg_buffer) | 0; //@line 2403
   $$0 = $0; //@line 2404
   STACKTOP = sp; //@line 2405
   return $$0 | 0; //@line 2405
  }
 case 2:
  {
   $23 = HEAPU8[$0 + 45 >> 0] | 0; //@line 2414
   HEAP32[$vararg_buffer4 >> 2] = HEAPU8[$0 + 44 >> 0]; //@line 2415
   HEAP32[$vararg_buffer4 + 4 >> 2] = $23; //@line 2417
   _sprintf($0, 2274, $vararg_buffer4) | 0; //@line 2418
   HEAP8[$0 + 4 >> 0] = 58; //@line 2420
   $31 = HEAPU8[$0 + 47 >> 0] | 0; //@line 2427
   HEAP32[$vararg_buffer8 >> 2] = HEAPU8[$0 + 46 >> 0]; //@line 2428
   HEAP32[$vararg_buffer8 + 4 >> 2] = $31; //@line 2430
   _sprintf($0 + 5 | 0, 2274, $vararg_buffer8) | 0; //@line 2431
   HEAP8[$0 + 9 >> 0] = 58; //@line 2433
   $39 = HEAPU8[$0 + 49 >> 0] | 0; //@line 2440
   HEAP32[$vararg_buffer12 >> 2] = HEAPU8[$0 + 48 >> 0]; //@line 2441
   HEAP32[$vararg_buffer12 + 4 >> 2] = $39; //@line 2443
   _sprintf($0 + 10 | 0, 2274, $vararg_buffer12) | 0; //@line 2444
   HEAP8[$0 + 14 >> 0] = 58; //@line 2446
   $47 = HEAPU8[$0 + 51 >> 0] | 0; //@line 2453
   HEAP32[$vararg_buffer16 >> 2] = HEAPU8[$0 + 50 >> 0]; //@line 2454
   HEAP32[$vararg_buffer16 + 4 >> 2] = $47; //@line 2456
   _sprintf($0 + 15 | 0, 2274, $vararg_buffer16) | 0; //@line 2457
   HEAP8[$0 + 19 >> 0] = 58; //@line 2459
   $55 = HEAPU8[$0 + 53 >> 0] | 0; //@line 2466
   HEAP32[$vararg_buffer20 >> 2] = HEAPU8[$0 + 52 >> 0]; //@line 2467
   HEAP32[$vararg_buffer20 + 4 >> 2] = $55; //@line 2469
   _sprintf($0 + 20 | 0, 2274, $vararg_buffer20) | 0; //@line 2470
   HEAP8[$0 + 24 >> 0] = 58; //@line 2472
   $63 = HEAPU8[$0 + 55 >> 0] | 0; //@line 2479
   HEAP32[$vararg_buffer24 >> 2] = HEAPU8[$0 + 54 >> 0]; //@line 2480
   HEAP32[$vararg_buffer24 + 4 >> 2] = $63; //@line 2482
   _sprintf($0 + 25 | 0, 2274, $vararg_buffer24) | 0; //@line 2483
   HEAP8[$0 + 29 >> 0] = 58; //@line 2485
   $71 = HEAPU8[$0 + 57 >> 0] | 0; //@line 2492
   HEAP32[$vararg_buffer28 >> 2] = HEAPU8[$0 + 56 >> 0]; //@line 2493
   HEAP32[$vararg_buffer28 + 4 >> 2] = $71; //@line 2495
   _sprintf($0 + 30 | 0, 2274, $vararg_buffer28) | 0; //@line 2496
   HEAP8[$0 + 34 >> 0] = 58; //@line 2498
   $79 = HEAPU8[$0 + 59 >> 0] | 0; //@line 2505
   HEAP32[$vararg_buffer32 >> 2] = HEAPU8[$0 + 58 >> 0]; //@line 2506
   HEAP32[$vararg_buffer32 + 4 >> 2] = $79; //@line 2508
   _sprintf($0 + 35 | 0, 2274, $vararg_buffer32) | 0; //@line 2509
   HEAP8[$0 + 39 >> 0] = 0; //@line 2511
   $$0 = $0; //@line 2512
   STACKTOP = sp; //@line 2513
   return $$0 | 0; //@line 2513
  }
 default:
  {
   $$0 = $0; //@line 2517
   STACKTOP = sp; //@line 2518
   return $$0 | 0; //@line 2518
  }
 }
 return 0; //@line 2521
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2857
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2859
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2861
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2863
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2865
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2867
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2869
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 2872
 $16 = HEAP8[$0 + 29 >> 0] & 1; //@line 2875
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 2877
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 2879
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 2881
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 2883
 $26 = HEAP8[$0 + 48 >> 0] & 1; //@line 2886
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 2888
 L2 : do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   do {
    if (!(HEAP8[$24 >> 0] | 0)) {
     $$182$off0 = $14; //@line 2897
     $$186$off0 = $16; //@line 2897
    } else {
     if (!(HEAP8[$22 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $16; //@line 2906
       $$283$off0 = 1; //@line 2906
       label = 13; //@line 2907
       break L2;
      } else {
       $$182$off0 = 1; //@line 2910
       $$186$off0 = $16; //@line 2910
       break;
      }
     }
     if ((HEAP32[$6 >> 2] | 0) == 1) {
      label = 18; //@line 2917
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 2924
      break L2;
     } else {
      $$182$off0 = 1; //@line 2927
      $$186$off0 = 1; //@line 2927
     }
    }
   } while (0);
   $30 = $18 + 8 | 0; //@line 2931
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$22 >> 0] = 0; //@line 2934
    HEAP8[$24 >> 0] = 0; //@line 2935
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 2936
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $8, $8, 1, $26); //@line 2937
    if (!___async) {
     ___async_unwind = 0; //@line 2940
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 163; //@line 2942
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2944
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2946
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2948
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 2950
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 2952
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 2954
    HEAP8[$ReallocAsyncCtx5 + 28 >> 0] = $$182$off0 & 1; //@line 2957
    HEAP8[$ReallocAsyncCtx5 + 29 >> 0] = $$186$off0 & 1; //@line 2960
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $30; //@line 2962
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 2964
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 2966
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 2968
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $26 & 1; //@line 2971
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 2973
    sp = STACKTOP; //@line 2974
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2977
    $$283$off0 = $$182$off0; //@line 2977
    label = 13; //@line 2978
   }
  } else {
   $$085$off0$reg2mem$0 = $16; //@line 2981
   $$283$off0 = $14; //@line 2981
   label = 13; //@line 2982
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$10 >> 2] = $8; //@line 2988
    $59 = $12 + 40 | 0; //@line 2989
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 2992
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$6 >> 2] | 0) == 2) {
      HEAP8[$4 >> 0] = 1; //@line 3000
      if ($$283$off0) {
       label = 18; //@line 3002
       break;
      } else {
       $67 = 4; //@line 3005
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3012
   } else {
    $67 = 4; //@line 3014
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3019
 }
 HEAP32[$2 >> 2] = $67; //@line 3021
 return;
}
function _scanexp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$04860 = 0, $$049 = 0, $$1$be = 0, $$159 = 0, $$2$be = 0, $$2$lcssa = 0, $$254 = 0, $$3$be = 0, $100 = 0, $101 = 0, $11 = 0, $13 = 0, $14 = 0, $2 = 0, $22 = 0, $3 = 0, $38 = 0, $4 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $61 = 0, $63 = 0, $64 = 0, $65 = 0, $80 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 $2 = $0 + 4 | 0; //@line 2426
 $3 = HEAP32[$2 >> 2] | 0; //@line 2427
 $4 = $0 + 100 | 0; //@line 2428
 if ($3 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
  HEAP32[$2 >> 2] = $3 + 1; //@line 2433
  $11 = HEAPU8[$3 >> 0] | 0; //@line 2436
 } else {
  $11 = ___shgetc($0) | 0; //@line 2439
 }
 switch ($11 | 0) {
 case 43:
 case 45:
  {
   $13 = ($11 | 0) == 45 & 1; //@line 2444
   $14 = HEAP32[$2 >> 2] | 0; //@line 2445
   if ($14 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
    HEAP32[$2 >> 2] = $14 + 1; //@line 2450
    $22 = HEAPU8[$14 >> 0] | 0; //@line 2453
   } else {
    $22 = ___shgetc($0) | 0; //@line 2456
   }
   if (($1 | 0) != 0 & ($22 + -48 | 0) >>> 0 > 9) {
    if (!(HEAP32[$4 >> 2] | 0)) {
     $$0 = $13; //@line 2466
     $$049 = $22; //@line 2466
    } else {
     HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2470
     $$0 = $13; //@line 2471
     $$049 = $22; //@line 2471
    }
   } else {
    $$0 = $13; //@line 2474
    $$049 = $22; //@line 2474
   }
   break;
  }
 default:
  {
   $$0 = 0; //@line 2479
   $$049 = $11; //@line 2479
  }
 }
 if (($$049 + -48 | 0) >>> 0 > 9) {
  if (!(HEAP32[$4 >> 2] | 0)) {
   $100 = -2147483648; //@line 2488
   $101 = 0; //@line 2488
  } else {
   HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2492
   $100 = -2147483648; //@line 2493
   $101 = 0; //@line 2493
  }
 } else {
  $$04860 = 0; //@line 2496
  $$159 = $$049; //@line 2496
  while (1) {
   $$04860 = $$159 + -48 + ($$04860 * 10 | 0) | 0; //@line 2500
   $38 = HEAP32[$2 >> 2] | 0; //@line 2501
   if ($38 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
    HEAP32[$2 >> 2] = $38 + 1; //@line 2506
    $$1$be = HEAPU8[$38 >> 0] | 0; //@line 2509
   } else {
    $$1$be = ___shgetc($0) | 0; //@line 2512
   }
   if (!(($$1$be + -48 | 0) >>> 0 < 10 & ($$04860 | 0) < 214748364)) {
    break;
   } else {
    $$159 = $$1$be; //@line 2519
   }
  }
  $50 = (($$04860 | 0) < 0) << 31 >> 31; //@line 2525
  if (($$1$be + -48 | 0) >>> 0 < 10) {
   $$254 = $$1$be; //@line 2529
   $55 = $$04860; //@line 2529
   $56 = $50; //@line 2529
   while (1) {
    $57 = ___muldi3($55 | 0, $56 | 0, 10, 0) | 0; //@line 2531
    $58 = tempRet0; //@line 2532
    $61 = _i64Add($$254 | 0, (($$254 | 0) < 0) << 31 >> 31 | 0, -48, -1) | 0; //@line 2535
    $63 = _i64Add($61 | 0, tempRet0 | 0, $57 | 0, $58 | 0) | 0; //@line 2537
    $64 = tempRet0; //@line 2538
    $65 = HEAP32[$2 >> 2] | 0; //@line 2539
    if ($65 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$2 >> 2] = $65 + 1; //@line 2544
     $$2$be = HEAPU8[$65 >> 0] | 0; //@line 2547
    } else {
     $$2$be = ___shgetc($0) | 0; //@line 2550
    }
    if (($$2$be + -48 | 0) >>> 0 < 10 & (($64 | 0) < 21474836 | ($64 | 0) == 21474836 & $63 >>> 0 < 2061584302)) {
     $$254 = $$2$be; //@line 2561
     $55 = $63; //@line 2561
     $56 = $64; //@line 2561
    } else {
     $$2$lcssa = $$2$be; //@line 2563
     $94 = $63; //@line 2563
     $95 = $64; //@line 2563
     break;
    }
   }
  } else {
   $$2$lcssa = $$1$be; //@line 2568
   $94 = $$04860; //@line 2568
   $95 = $50; //@line 2568
  }
  if (($$2$lcssa + -48 | 0) >>> 0 < 10) {
   do {
    $80 = HEAP32[$2 >> 2] | 0; //@line 2574
    if ($80 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$2 >> 2] = $80 + 1; //@line 2579
     $$3$be = HEAPU8[$80 >> 0] | 0; //@line 2582
    } else {
     $$3$be = ___shgetc($0) | 0; //@line 2585
    }
   } while (($$3$be + -48 | 0) >>> 0 < 10);
  }
  if (HEAP32[$4 >> 2] | 0) {
   HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2599
  }
  $93 = ($$0 | 0) != 0; //@line 2601
  $96 = _i64Subtract(0, 0, $94 | 0, $95 | 0) | 0; //@line 2602
  $100 = $93 ? tempRet0 : $95; //@line 2606
  $101 = $93 ? $96 : $94; //@line 2606
 }
 tempRet0 = $100; //@line 2608
 return $101 | 0; //@line 2609
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2701
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2703
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2705
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2707
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2709
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 2712
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2714
 $15 = $12 + 24 | 0; //@line 2717
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 2722
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 2726
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 2733
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2744
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2745
      if (!___async) {
       ___async_unwind = 0; //@line 2748
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 167; //@line 2750
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2752
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2754
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2756
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2758
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 2760
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 2762
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 2764
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 2767
      sp = STACKTOP; //@line 2768
      return;
     }
     $36 = $4 + 24 | 0; //@line 2771
     $37 = $4 + 54 | 0; //@line 2772
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2787
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2788
     if (!___async) {
      ___async_unwind = 0; //@line 2791
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 166; //@line 2793
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2795
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 2797
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2799
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2801
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2803
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 2805
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 2807
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 2809
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 2812
     sp = STACKTOP; //@line 2813
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 2817
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2821
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2822
    if (!___async) {
     ___async_unwind = 0; //@line 2825
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 165; //@line 2827
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2829
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 2831
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2833
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 2835
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 2837
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 2839
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 2842
    sp = STACKTOP; //@line 2843
    return;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $31 = 0, $32 = 0, $33 = 0, $62 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7418
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7423
 } else {
  $9 = $1 + 52 | 0; //@line 7425
  $10 = HEAP8[$9 >> 0] | 0; //@line 7426
  $11 = $1 + 53 | 0; //@line 7427
  $12 = HEAP8[$11 >> 0] | 0; //@line 7428
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 7431
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 7432
  HEAP8[$9 >> 0] = 0; //@line 7433
  HEAP8[$11 >> 0] = 0; //@line 7434
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 7435
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 7436
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 161; //@line 7439
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 7441
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7443
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7445
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 7447
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 7449
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 7451
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 7453
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 7455
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 7457
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 7459
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 7462
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 7464
   sp = STACKTOP; //@line 7465
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7468
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 7473
    $32 = $0 + 8 | 0; //@line 7474
    $33 = $1 + 54 | 0; //@line 7475
    $$0 = $0 + 24 | 0; //@line 7476
    while (1) {
     if (HEAP8[$33 >> 0] | 0) {
      break L7;
     }
     if (!(HEAP8[$9 >> 0] | 0)) {
      if (HEAP8[$11 >> 0] | 0) {
       if (!(HEAP32[$32 >> 2] & 1)) {
        break L7;
       }
      }
     } else {
      if ((HEAP32[$31 >> 2] | 0) == 1) {
       break L7;
      }
      if (!(HEAP32[$32 >> 2] & 2)) {
       break L7;
      }
     }
     HEAP8[$9 >> 0] = 0; //@line 7509
     HEAP8[$11 >> 0] = 0; //@line 7510
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 7511
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 7512
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 7517
     $62 = $$0 + 8 | 0; //@line 7518
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 7521
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 162; //@line 7526
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 7528
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 7530
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 7532
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 7534
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 7536
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 7538
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 7540
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 7542
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 7544
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 7546
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 7548
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 7550
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 7552
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 7555
    sp = STACKTOP; //@line 7556
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 7560
  HEAP8[$11 >> 0] = $12; //@line 7561
 }
 return;
}
function _pop_arg_673($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $108 = 0, $109 = 0.0, $115 = 0, $116 = 0.0, $16 = 0, $17 = 0, $20 = 0, $29 = 0, $30 = 0, $31 = 0, $40 = 0, $41 = 0, $43 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $59 = 0, $62 = 0, $71 = 0, $72 = 0, $73 = 0, $82 = 0, $83 = 0, $85 = 0, $88 = 0, $9 = 0, $97 = 0, $98 = 0, $99 = 0;
 L1 : do {
  if ($1 >>> 0 <= 20) {
   do {
    switch ($1 | 0) {
    case 9:
     {
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4300
      $10 = HEAP32[$9 >> 2] | 0; //@line 4301
      HEAP32[$2 >> 2] = $9 + 4; //@line 4303
      HEAP32[$0 >> 2] = $10; //@line 4304
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4320
      $17 = HEAP32[$16 >> 2] | 0; //@line 4321
      HEAP32[$2 >> 2] = $16 + 4; //@line 4323
      $20 = $0; //@line 4326
      HEAP32[$20 >> 2] = $17; //@line 4328
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 4331
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4347
      $30 = HEAP32[$29 >> 2] | 0; //@line 4348
      HEAP32[$2 >> 2] = $29 + 4; //@line 4350
      $31 = $0; //@line 4351
      HEAP32[$31 >> 2] = $30; //@line 4353
      HEAP32[$31 + 4 >> 2] = 0; //@line 4356
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4372
      $41 = $40; //@line 4373
      $43 = HEAP32[$41 >> 2] | 0; //@line 4375
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 4378
      HEAP32[$2 >> 2] = $40 + 8; //@line 4380
      $47 = $0; //@line 4381
      HEAP32[$47 >> 2] = $43; //@line 4383
      HEAP32[$47 + 4 >> 2] = $46; //@line 4386
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4402
      $57 = HEAP32[$56 >> 2] | 0; //@line 4403
      HEAP32[$2 >> 2] = $56 + 4; //@line 4405
      $59 = ($57 & 65535) << 16 >> 16; //@line 4407
      $62 = $0; //@line 4410
      HEAP32[$62 >> 2] = $59; //@line 4412
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 4415
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4431
      $72 = HEAP32[$71 >> 2] | 0; //@line 4432
      HEAP32[$2 >> 2] = $71 + 4; //@line 4434
      $73 = $0; //@line 4436
      HEAP32[$73 >> 2] = $72 & 65535; //@line 4438
      HEAP32[$73 + 4 >> 2] = 0; //@line 4441
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4457
      $83 = HEAP32[$82 >> 2] | 0; //@line 4458
      HEAP32[$2 >> 2] = $82 + 4; //@line 4460
      $85 = ($83 & 255) << 24 >> 24; //@line 4462
      $88 = $0; //@line 4465
      HEAP32[$88 >> 2] = $85; //@line 4467
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 4470
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4486
      $98 = HEAP32[$97 >> 2] | 0; //@line 4487
      HEAP32[$2 >> 2] = $97 + 4; //@line 4489
      $99 = $0; //@line 4491
      HEAP32[$99 >> 2] = $98 & 255; //@line 4493
      HEAP32[$99 + 4 >> 2] = 0; //@line 4496
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4512
      $109 = +HEAPF64[$108 >> 3]; //@line 4513
      HEAP32[$2 >> 2] = $108 + 8; //@line 4515
      HEAPF64[$0 >> 3] = $109; //@line 4516
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4532
      $116 = +HEAPF64[$115 >> 3]; //@line 4533
      HEAP32[$2 >> 2] = $115 + 8; //@line 4535
      HEAPF64[$0 >> 3] = $116; //@line 4536
      break L1;
      break;
     }
    default:
     {
      break L1;
     }
    }
   } while (0);
  }
 } while (0);
 return;
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3200
 STACKTOP = STACKTOP + 224 | 0; //@line 3201
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 3201
 $3 = sp + 120 | 0; //@line 3202
 $4 = sp + 80 | 0; //@line 3203
 $5 = sp; //@line 3204
 $6 = sp + 136 | 0; //@line 3205
 dest = $4; //@line 3206
 stop = dest + 40 | 0; //@line 3206
 do {
  HEAP32[dest >> 2] = 0; //@line 3206
  dest = dest + 4 | 0; //@line 3206
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 3208
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 3212
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 3219
  } else {
   $43 = 0; //@line 3221
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 3223
  $14 = $13 & 32; //@line 3224
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 3230
  }
  $19 = $0 + 48 | 0; //@line 3232
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 3237
    $24 = HEAP32[$23 >> 2] | 0; //@line 3238
    HEAP32[$23 >> 2] = $6; //@line 3239
    $25 = $0 + 28 | 0; //@line 3240
    HEAP32[$25 >> 2] = $6; //@line 3241
    $26 = $0 + 20 | 0; //@line 3242
    HEAP32[$26 >> 2] = $6; //@line 3243
    HEAP32[$19 >> 2] = 80; //@line 3244
    $28 = $0 + 16 | 0; //@line 3246
    HEAP32[$28 >> 2] = $6 + 80; //@line 3247
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 3248
    if (!$24) {
     $$1 = $29; //@line 3251
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 3254
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 3255
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 3256
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 138; //@line 3259
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 3261
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 3263
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 3265
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 3267
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 3269
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 3271
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 3273
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3275
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 3277
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 3279
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 3281
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 3283
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 3285
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 3287
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 3289
      sp = STACKTOP; //@line 3290
      STACKTOP = sp; //@line 3291
      return 0; //@line 3291
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 3293
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 3296
      HEAP32[$23 >> 2] = $24; //@line 3297
      HEAP32[$19 >> 2] = 0; //@line 3298
      HEAP32[$28 >> 2] = 0; //@line 3299
      HEAP32[$25 >> 2] = 0; //@line 3300
      HEAP32[$26 >> 2] = 0; //@line 3301
      $$1 = $$; //@line 3302
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 3308
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 3311
  HEAP32[$0 >> 2] = $51 | $14; //@line 3316
  if ($43 | 0) {
   ___unlockfile($0); //@line 3319
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 3321
 }
 STACKTOP = sp; //@line 3323
 return $$0 | 0; //@line 3323
}
function __ZN9UDPSocket6sendtoEPKctPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$byval_copy = 0, $11 = 0, $12 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $26 = 0, $29 = 0, $30 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2875
 STACKTOP = STACKTOP + 112 | 0; //@line 2876
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(112); //@line 2876
 $$byval_copy = sp + 88 | 0; //@line 2877
 $5 = sp + 24 | 0; //@line 2878
 $6 = sp; //@line 2879
 HEAP32[$6 >> 2] = 0; //@line 2880
 HEAP32[$6 + 4 >> 2] = 0; //@line 2880
 HEAP32[$6 + 8 >> 2] = 0; //@line 2880
 HEAP32[$6 + 12 >> 2] = 0; //@line 2880
 HEAP32[$6 + 16 >> 2] = 0; //@line 2880
 HEAP32[$$byval_copy >> 2] = HEAP32[$6 >> 2]; //@line 2881
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$6 + 4 >> 2]; //@line 2881
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$6 + 8 >> 2]; //@line 2881
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$6 + 12 >> 2]; //@line 2881
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$6 + 16 >> 2]; //@line 2881
 __ZN13SocketAddressC2E10nsapi_addrt($5, $$byval_copy, 0); //@line 2882
 $7 = $0 + 4 | 0; //@line 2883
 $8 = HEAP32[$7 >> 2] | 0; //@line 2884
 $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 12 >> 2] | 0; //@line 2887
 $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 2888
 $12 = FUNCTION_TABLE_iiiii[$11 & 15]($8, $1, $5, 0) | 0; //@line 2889
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 2892
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 2894
  HEAP16[$AsyncCtx + 8 >> 1] = $2; //@line 2896
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2898
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 2900
  HEAP32[$AsyncCtx + 20 >> 2] = $7; //@line 2902
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 2904
  HEAP32[$AsyncCtx + 28 >> 2] = $4; //@line 2906
  sp = STACKTOP; //@line 2907
  STACKTOP = sp; //@line 2908
  return 0; //@line 2908
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2910
 if ($12 | 0) {
  $$0 = -3009; //@line 2913
  STACKTOP = sp; //@line 2914
  return $$0 | 0; //@line 2914
 }
 __ZN13SocketAddress8set_portEt($5, $2); //@line 2916
 $21 = $0 + 8 | 0; //@line 2917
 $22 = $0 + 52 | 0; //@line 2918
 $23 = $0 + 12 | 0; //@line 2919
 while (1) {
  $24 = HEAP32[$21 >> 2] | 0; //@line 2921
  if (!$24) {
   $$0 = -3005; //@line 2924
   label = 9; //@line 2925
   break;
  }
  HEAP32[$22 >> 2] = 0; //@line 2928
  $26 = HEAP32[$7 >> 2] | 0; //@line 2929
  $29 = HEAP32[(HEAP32[$26 >> 2] | 0) + 60 >> 2] | 0; //@line 2932
  $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2933
  $30 = FUNCTION_TABLE_iiiiii[$29 & 7]($26, $24, $5, $3, $4) | 0; //@line 2934
  if (___async) {
   label = 7; //@line 2937
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2940
  if (($30 | 0) != -3001 | (HEAP32[$23 >> 2] | 0) == 0) {
   $$0 = $30; //@line 2946
   label = 9; //@line 2947
   break;
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 75; //@line 2952
  HEAP32[$AsyncCtx3 + 4 >> 2] = $23; //@line 2954
  HEAP32[$AsyncCtx3 + 8 >> 2] = $5; //@line 2956
  HEAP32[$AsyncCtx3 + 12 >> 2] = $21; //@line 2958
  HEAP32[$AsyncCtx3 + 16 >> 2] = $22; //@line 2960
  HEAP32[$AsyncCtx3 + 20 >> 2] = $7; //@line 2962
  HEAP32[$AsyncCtx3 + 24 >> 2] = $5; //@line 2964
  HEAP32[$AsyncCtx3 + 28 >> 2] = $3; //@line 2966
  HEAP32[$AsyncCtx3 + 32 >> 2] = $4; //@line 2968
  sp = STACKTOP; //@line 2969
  STACKTOP = sp; //@line 2970
  return 0; //@line 2970
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 2973
  return $$0 | 0; //@line 2973
 }
 return 0; //@line 2975
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8996
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8998
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9000
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9002
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9004
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9006
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9008
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9010
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9012
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9014
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9016
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9018
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9020
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9022
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9024
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9026
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9028
 if (($AsyncRetVal | 0) == 4) {
  HEAP32[$24 >> 2] = (_llvm_bswap_i32(HEAP32[$22 >> 2] | 0) | 0) + 2085978496; //@line 9034
  HEAP32[$26 >> 2] = _ctime($24 | 0) | 0; //@line 9036
  _printf(2636, $26) | 0; //@line 9037
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(64) | 0; //@line 9038
  __ZN6Socket5closeEv($30) | 0; //@line 9039
  if (!___async) {
   ___async_unwind = 0; //@line 9042
  }
  HEAP32[$ReallocAsyncCtx7 >> 2] = 124; //@line 9044
  HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 9046
  HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $4; //@line 9048
  HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $6; //@line 9050
  HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $8; //@line 9052
  HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $10; //@line 9054
  HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $12; //@line 9056
  HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $14; //@line 9058
  HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $16; //@line 9060
  HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $18; //@line 9062
  HEAP32[$ReallocAsyncCtx7 + 40 >> 2] = $20; //@line 9064
  HEAP32[$ReallocAsyncCtx7 + 44 >> 2] = $22; //@line 9066
  HEAP32[$ReallocAsyncCtx7 + 48 >> 2] = $24; //@line 9068
  HEAP32[$ReallocAsyncCtx7 + 52 >> 2] = $26; //@line 9070
  HEAP32[$ReallocAsyncCtx7 + 56 >> 2] = $28; //@line 9072
  HEAP32[$ReallocAsyncCtx7 + 60 >> 2] = $30; //@line 9074
  sp = STACKTOP; //@line 9075
  return;
 } else {
  HEAP32[$18 >> 2] = $AsyncRetVal; //@line 9078
  _printf(2614, $18) | 0; //@line 9079
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(64) | 0; //@line 9080
  _wait_ms(1e4); //@line 9081
  if (!___async) {
   ___async_unwind = 0; //@line 9084
  }
  HEAP32[$ReallocAsyncCtx9 >> 2] = 123; //@line 9086
  HEAP32[$ReallocAsyncCtx9 + 4 >> 2] = $2; //@line 9088
  HEAP32[$ReallocAsyncCtx9 + 8 >> 2] = $4; //@line 9090
  HEAP32[$ReallocAsyncCtx9 + 12 >> 2] = $6; //@line 9092
  HEAP32[$ReallocAsyncCtx9 + 16 >> 2] = $8; //@line 9094
  HEAP32[$ReallocAsyncCtx9 + 20 >> 2] = $10; //@line 9096
  HEAP32[$ReallocAsyncCtx9 + 24 >> 2] = $12; //@line 9098
  HEAP32[$ReallocAsyncCtx9 + 28 >> 2] = $14; //@line 9100
  HEAP32[$ReallocAsyncCtx9 + 32 >> 2] = $16; //@line 9102
  HEAP32[$ReallocAsyncCtx9 + 36 >> 2] = $18; //@line 9104
  HEAP32[$ReallocAsyncCtx9 + 40 >> 2] = $20; //@line 9106
  HEAP32[$ReallocAsyncCtx9 + 44 >> 2] = $22; //@line 9108
  HEAP32[$ReallocAsyncCtx9 + 48 >> 2] = $24; //@line 9110
  HEAP32[$ReallocAsyncCtx9 + 52 >> 2] = $26; //@line 9112
  HEAP32[$ReallocAsyncCtx9 + 56 >> 2] = $28; //@line 9114
  HEAP32[$ReallocAsyncCtx9 + 60 >> 2] = $30; //@line 9116
  sp = STACKTOP; //@line 9117
  return;
 }
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6953
 STACKTOP = STACKTOP + 64 | 0; //@line 6954
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6954
 $4 = sp; //@line 6955
 $5 = HEAP32[$0 >> 2] | 0; //@line 6956
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 6959
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 6961
 HEAP32[$4 >> 2] = $2; //@line 6962
 HEAP32[$4 + 4 >> 2] = $0; //@line 6964
 HEAP32[$4 + 8 >> 2] = $1; //@line 6966
 HEAP32[$4 + 12 >> 2] = $3; //@line 6968
 $14 = $4 + 16 | 0; //@line 6969
 $15 = $4 + 20 | 0; //@line 6970
 $16 = $4 + 24 | 0; //@line 6971
 $17 = $4 + 28 | 0; //@line 6972
 $18 = $4 + 32 | 0; //@line 6973
 $19 = $4 + 40 | 0; //@line 6974
 dest = $14; //@line 6975
 stop = dest + 36 | 0; //@line 6975
 do {
  HEAP32[dest >> 2] = 0; //@line 6975
  dest = dest + 4 | 0; //@line 6975
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 6975
 HEAP8[$14 + 38 >> 0] = 0; //@line 6975
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 6980
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 6983
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6984
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 6985
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 153; //@line 6988
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 6990
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 6992
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 6994
    sp = STACKTOP; //@line 6995
    STACKTOP = sp; //@line 6996
    return 0; //@line 6996
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6998
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 7002
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 7006
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 7009
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 7010
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 7011
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 154; //@line 7014
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 7016
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 7018
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 7020
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 7022
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 7024
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 7026
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 7028
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 7030
    sp = STACKTOP; //@line 7031
    STACKTOP = sp; //@line 7032
    return 0; //@line 7032
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7034
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 7048
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 7056
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 7072
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 7077
  }
 } while (0);
 STACKTOP = sp; //@line 7080
 return $$0 | 0; //@line 7080
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $48 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9127
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9129
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9131
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9133
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9135
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9137
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9139
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9141
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9143
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9145
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9147
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9149
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9151
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9153
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9155
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9157
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9159
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 9162
  _printf(2589, $12) | 0; //@line 9163
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(64) | 0; //@line 9164
  _wait_ms(1e4); //@line 9165
  if (!___async) {
   ___async_unwind = 0; //@line 9168
  }
  HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 9170
  HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $2; //@line 9172
  HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $4; //@line 9174
  HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $6; //@line 9176
  HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $8; //@line 9178
  HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $10; //@line 9180
  HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $12; //@line 9182
  HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $14; //@line 9184
  HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $16; //@line 9186
  HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $18; //@line 9188
  HEAP32[$ReallocAsyncCtx10 + 40 >> 2] = $20; //@line 9190
  HEAP32[$ReallocAsyncCtx10 + 44 >> 2] = $22; //@line 9192
  HEAP32[$ReallocAsyncCtx10 + 48 >> 2] = $24; //@line 9194
  HEAP32[$ReallocAsyncCtx10 + 52 >> 2] = $26; //@line 9196
  HEAP32[$ReallocAsyncCtx10 + 56 >> 2] = $28; //@line 9198
  HEAP32[$ReallocAsyncCtx10 + 60 >> 2] = $30; //@line 9200
  sp = STACKTOP; //@line 9201
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 9204
  $48 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($6, 0, $4, 4) | 0; //@line 9205
  if (!___async) {
   HEAP32[___async_retval >> 2] = $48; //@line 9209
   ___async_unwind = 0; //@line 9210
  }
  HEAP32[$ReallocAsyncCtx4 >> 2] = 122; //@line 9212
  HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 9214
  HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 9216
  HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 9218
  HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 9220
  HEAP32[$ReallocAsyncCtx4 + 20 >> 2] = $10; //@line 9222
  HEAP32[$ReallocAsyncCtx4 + 24 >> 2] = $12; //@line 9224
  HEAP32[$ReallocAsyncCtx4 + 28 >> 2] = $14; //@line 9226
  HEAP32[$ReallocAsyncCtx4 + 32 >> 2] = $16; //@line 9228
  HEAP32[$ReallocAsyncCtx4 + 36 >> 2] = $18; //@line 9230
  HEAP32[$ReallocAsyncCtx4 + 40 >> 2] = $20; //@line 9232
  HEAP32[$ReallocAsyncCtx4 + 44 >> 2] = $22; //@line 9234
  HEAP32[$ReallocAsyncCtx4 + 48 >> 2] = $24; //@line 9236
  HEAP32[$ReallocAsyncCtx4 + 52 >> 2] = $26; //@line 9238
  HEAP32[$ReallocAsyncCtx4 + 56 >> 2] = $28; //@line 9240
  HEAP32[$ReallocAsyncCtx4 + 60 >> 2] = $30; //@line 9242
  sp = STACKTOP; //@line 9243
  return;
 }
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 10768
 do {
  if (!$0) {
   do {
    if (!(HEAP32[203] | 0)) {
     $34 = 0; //@line 10776
    } else {
     $12 = HEAP32[203] | 0; //@line 10778
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10779
     $13 = _fflush($12) | 0; //@line 10780
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 134; //@line 10783
      sp = STACKTOP; //@line 10784
      return 0; //@line 10785
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 10787
      $34 = $13; //@line 10788
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 10794
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 10798
    } else {
     $$02327 = $$02325; //@line 10800
     $$02426 = $34; //@line 10800
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 10807
      } else {
       $28 = 0; //@line 10809
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10817
       $25 = ___fflush_unlocked($$02327) | 0; //@line 10818
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 10823
       $$1 = $25 | $$02426; //@line 10825
      } else {
       $$1 = $$02426; //@line 10827
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 10831
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 10834
      if (!$$023) {
       $$024$lcssa = $$1; //@line 10837
       break L9;
      } else {
       $$02327 = $$023; //@line 10840
       $$02426 = $$1; //@line 10840
      }
     }
     HEAP32[$AsyncCtx >> 2] = 135; //@line 10843
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 10845
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 10847
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 10849
     sp = STACKTOP; //@line 10850
     return 0; //@line 10851
    }
   } while (0);
   ___ofl_unlock(); //@line 10854
   $$0 = $$024$lcssa; //@line 10855
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10861
    $5 = ___fflush_unlocked($0) | 0; //@line 10862
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 132; //@line 10865
     sp = STACKTOP; //@line 10866
     return 0; //@line 10867
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 10869
     $$0 = $5; //@line 10870
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 10875
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 10876
   $7 = ___fflush_unlocked($0) | 0; //@line 10877
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 133; //@line 10880
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 10883
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10885
    sp = STACKTOP; //@line 10886
    return 0; //@line 10887
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10889
   if ($phitmp) {
    $$0 = $7; //@line 10891
   } else {
    ___unlockfile($0); //@line 10893
    $$0 = $7; //@line 10894
   }
  }
 } while (0);
 return $$0 | 0; //@line 10898
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 3072
 $7 = ($2 | 0) != 0; //@line 3076
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 3080
   $$03555 = $0; //@line 3081
   $$03654 = $2; //@line 3081
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 3086
     $$036$lcssa64 = $$03654; //@line 3086
     label = 6; //@line 3087
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 3090
    $12 = $$03654 + -1 | 0; //@line 3091
    $16 = ($12 | 0) != 0; //@line 3095
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 3098
     $$03654 = $12; //@line 3098
    } else {
     $$035$lcssa = $11; //@line 3100
     $$036$lcssa = $12; //@line 3100
     $$lcssa = $16; //@line 3100
     label = 5; //@line 3101
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 3106
   $$036$lcssa = $2; //@line 3106
   $$lcssa = $7; //@line 3106
   label = 5; //@line 3107
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 3112
   $$036$lcssa64 = $$036$lcssa; //@line 3112
   label = 6; //@line 3113
  } else {
   $$2 = $$035$lcssa; //@line 3115
   $$3 = 0; //@line 3115
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 3121
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 3124
    $$3 = $$036$lcssa64; //@line 3124
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 3126
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 3130
      $$13745 = $$036$lcssa64; //@line 3130
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 3133
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 3142
       $30 = $$13745 + -4 | 0; //@line 3143
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 3146
        $$13745 = $30; //@line 3146
       } else {
        $$0$lcssa = $29; //@line 3148
        $$137$lcssa = $30; //@line 3148
        label = 11; //@line 3149
        break L11;
       }
      }
      $$140 = $$046; //@line 3153
      $$23839 = $$13745; //@line 3153
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 3155
      $$137$lcssa = $$036$lcssa64; //@line 3155
      label = 11; //@line 3156
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 3162
      $$3 = 0; //@line 3162
      break;
     } else {
      $$140 = $$0$lcssa; //@line 3165
      $$23839 = $$137$lcssa; //@line 3165
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 3172
      $$3 = $$23839; //@line 3172
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 3175
     $$23839 = $$23839 + -1 | 0; //@line 3176
     if (!$$23839) {
      $$2 = $35; //@line 3179
      $$3 = 0; //@line 3179
      break;
     } else {
      $$140 = $35; //@line 3182
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 3190
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7135
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7141
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 7147
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 7150
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7151
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 7152
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 157; //@line 7155
     sp = STACKTOP; //@line 7156
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7159
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 7167
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 7172
     $19 = $1 + 44 | 0; //@line 7173
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 7179
     HEAP8[$22 >> 0] = 0; //@line 7180
     $23 = $1 + 53 | 0; //@line 7181
     HEAP8[$23 >> 0] = 0; //@line 7182
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 7184
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 7187
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 7188
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 7189
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 156; //@line 7192
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 7194
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7196
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 7198
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 7200
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 7202
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 7204
      sp = STACKTOP; //@line 7205
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 7208
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 7212
      label = 13; //@line 7213
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 7218
       label = 13; //@line 7219
      } else {
       $$037$off039 = 3; //@line 7221
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 7225
      $39 = $1 + 40 | 0; //@line 7226
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 7229
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7239
        $$037$off039 = $$037$off038; //@line 7240
       } else {
        $$037$off039 = $$037$off038; //@line 7242
       }
      } else {
       $$037$off039 = $$037$off038; //@line 7245
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 7248
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 7255
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 6447
 STACKTOP = STACKTOP + 48 | 0; //@line 6448
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 6448
 $vararg_buffer10 = sp + 32 | 0; //@line 6449
 $vararg_buffer7 = sp + 24 | 0; //@line 6450
 $vararg_buffer3 = sp + 16 | 0; //@line 6451
 $vararg_buffer = sp; //@line 6452
 $0 = sp + 36 | 0; //@line 6453
 $1 = ___cxa_get_globals_fast() | 0; //@line 6454
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 6457
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 6462
   $9 = HEAP32[$7 >> 2] | 0; //@line 6464
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 6467
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5491; //@line 6473
    _abort_message(5441, $vararg_buffer7); //@line 6474
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 6483
   } else {
    $22 = $3 + 80 | 0; //@line 6485
   }
   HEAP32[$0 >> 2] = $22; //@line 6487
   $23 = HEAP32[$3 >> 2] | 0; //@line 6488
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 6490
   $28 = HEAP32[(HEAP32[20] | 0) + 16 >> 2] | 0; //@line 6493
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 6494
   $29 = FUNCTION_TABLE_iiii[$28 & 15](80, $23, $0) | 0; //@line 6495
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 147; //@line 6498
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 6500
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 6502
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 6504
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 6506
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 6508
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 6510
    sp = STACKTOP; //@line 6511
    STACKTOP = sp; //@line 6512
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6514
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5491; //@line 6516
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 6518
    _abort_message(5400, $vararg_buffer3); //@line 6519
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 6522
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 6525
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 6526
   $40 = FUNCTION_TABLE_ii[$39 & 15]($36) | 0; //@line 6527
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 148; //@line 6530
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 6532
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 6534
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 6536
    sp = STACKTOP; //@line 6537
    STACKTOP = sp; //@line 6538
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 6540
    HEAP32[$vararg_buffer >> 2] = 5491; //@line 6541
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 6543
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 6545
    _abort_message(5355, $vararg_buffer); //@line 6546
   }
  }
 }
 _abort_message(5479, $vararg_buffer10); //@line 6551
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$1$i = 0, $14 = 0, $15 = 0, $23 = 0, $31 = 0, $32 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 784
 $5 = $0 + -4 | 0; //@line 785
 $6 = $1 + 8 | 0; //@line 786
 do {
  if (!(HEAP8[$6 >> 0] | 0)) {
   label = 7; //@line 791
  } else {
   if (!(__ZneRK13SocketAddressS1_($1 + 12 | 0, $2) | 0)) {
    if (!(HEAP8[$6 >> 0] | 0)) {
     label = 7; //@line 799
     break;
    } else {
     break;
    }
   }
   $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 805
   _puts(1552) | 0; //@line 806
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 42; //@line 809
    sp = STACKTOP; //@line 810
    return 0; //@line 811
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 813
   $$1$i = -3012; //@line 814
   return $$1$i | 0; //@line 815
  }
 } while (0);
 do {
  if ((label | 0) == 7) {
   $14 = HEAP32[(HEAP32[$5 >> 2] | 0) + 80 >> 2] | 0; //@line 822
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 823
   $15 = FUNCTION_TABLE_iiii[$14 & 15]($5, $1, $2) | 0; //@line 824
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 43; //@line 827
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 829
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 831
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 833
    HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 835
    HEAP32[$AsyncCtx + 20 >> 2] = $3; //@line 837
    HEAP32[$AsyncCtx + 24 >> 2] = $4; //@line 839
    sp = STACKTOP; //@line 840
    return 0; //@line 841
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 843
   if (($15 | 0) < 0) {
    $$1$i = $15; //@line 846
    return $$1$i | 0; //@line 847
   } else {
    $23 = $1 + 12 | 0; //@line 849
    dest = $23; //@line 850
    src = $2; //@line 850
    stop = dest + 60 | 0; //@line 850
    do {
     HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 850
     dest = dest + 4 | 0; //@line 850
     src = src + 4 | 0; //@line 850
    } while ((dest | 0) < (stop | 0));
    HEAP16[$23 + 60 >> 1] = HEAP16[$2 + 60 >> 1] | 0; //@line 850
    break;
   }
  }
 } while (0);
 $AsyncCtx10 = _emscripten_alloc_async_context(24, sp) | 0; //@line 855
 _wait_ms(1); //@line 856
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 44; //@line 859
  HEAP32[$AsyncCtx10 + 4 >> 2] = $5; //@line 861
  HEAP32[$AsyncCtx10 + 8 >> 2] = $5; //@line 863
  HEAP32[$AsyncCtx10 + 12 >> 2] = $1; //@line 865
  HEAP32[$AsyncCtx10 + 16 >> 2] = $3; //@line 867
  HEAP32[$AsyncCtx10 + 20 >> 2] = $4; //@line 869
  sp = STACKTOP; //@line 870
  return 0; //@line 871
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 873
 $31 = HEAP32[(HEAP32[$5 >> 2] | 0) + 88 >> 2] | 0; //@line 876
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 877
 $32 = FUNCTION_TABLE_iiiii[$31 & 15]($5, $1, $3, $4) | 0; //@line 878
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 45; //@line 881
  sp = STACKTOP; //@line 882
  return 0; //@line 883
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 885
 $$1$i = $32; //@line 886
 return $$1$i | 0; //@line 887
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_27($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12177
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12179
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12181
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12183
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12185
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12187
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12191
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12193
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12195
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12197
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12199
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12201
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12203
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12205
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12207
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12212
  $38 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($2, 0, $4, 512) | 0; //@line 12213
  if (!___async) {
   HEAP32[___async_retval >> 2] = $38; //@line 12217
   ___async_unwind = 0; //@line 12218
  }
  HEAP32[$ReallocAsyncCtx >> 2] = 90; //@line 12220
  HEAP32[$ReallocAsyncCtx + 4 >> 2] = $4; //@line 12222
  HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12224
  HEAP32[$ReallocAsyncCtx + 12 >> 2] = $8; //@line 12226
  HEAP32[$ReallocAsyncCtx + 16 >> 2] = $2; //@line 12228
  HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12230
  HEAP32[$ReallocAsyncCtx + 24 >> 2] = $14; //@line 12232
  HEAP32[$ReallocAsyncCtx + 28 >> 2] = $16; //@line 12234
  HEAP32[$ReallocAsyncCtx + 32 >> 2] = $18; //@line 12236
  HEAP32[$ReallocAsyncCtx + 36 >> 2] = $20; //@line 12238
  HEAP32[$ReallocAsyncCtx + 40 >> 2] = $22; //@line 12240
  HEAP32[$ReallocAsyncCtx + 44 >> 2] = $24; //@line 12242
  HEAP32[$ReallocAsyncCtx + 48 >> 2] = $26; //@line 12244
  HEAP32[$ReallocAsyncCtx + 52 >> 2] = $28; //@line 12246
  HEAP32[$ReallocAsyncCtx + 56 >> 2] = $30; //@line 12248
  sp = STACKTOP; //@line 12249
  return;
 }
 _free($4); //@line 12252
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 12253
 $32 = __ZN6Socket5closeEv($6) | 0; //@line 12254
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 12257
  $33 = $ReallocAsyncCtx12 + 4 | 0; //@line 12258
  HEAP32[$33 >> 2] = -3009; //@line 12259
  $34 = $ReallocAsyncCtx12 + 8 | 0; //@line 12260
  HEAP32[$34 >> 2] = $2; //@line 12261
  $35 = $ReallocAsyncCtx12 + 12 | 0; //@line 12262
  HEAP32[$35 >> 2] = $28; //@line 12263
  sp = STACKTOP; //@line 12264
  return;
 }
 HEAP32[___async_retval >> 2] = $32; //@line 12268
 ___async_unwind = 0; //@line 12269
 HEAP32[$ReallocAsyncCtx12 >> 2] = 81; //@line 12270
 $33 = $ReallocAsyncCtx12 + 4 | 0; //@line 12271
 HEAP32[$33 >> 2] = -3009; //@line 12272
 $34 = $ReallocAsyncCtx12 + 8 | 0; //@line 12273
 HEAP32[$34 >> 2] = $2; //@line 12274
 $35 = $ReallocAsyncCtx12 + 12 | 0; //@line 12275
 HEAP32[$35 >> 2] = $28; //@line 12276
 sp = STACKTOP; //@line 12277
 return;
}
function __ZN9UDPSocket6sendtoEPKctPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $14 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $36 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3029
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3031
 $4 = HEAP16[$0 + 8 >> 1] | 0; //@line 3033
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3035
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3037
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3039
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3041
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3043
 if (HEAP32[___async_retval >> 2] | 0) {
  $$0 = -3009; //@line 3048
  $36 = ___async_retval; //@line 3049
  HEAP32[$36 >> 2] = $$0; //@line 3050
  return;
 }
 __ZN13SocketAddress8set_portEt($2, $4); //@line 3053
 $17 = $6 + 8 | 0; //@line 3054
 $18 = $6 + 52 | 0; //@line 3055
 $19 = $6 + 12 | 0; //@line 3056
 $20 = HEAP32[$17 >> 2] | 0; //@line 3057
 if (!$20) {
  $$0 = -3005; //@line 3060
  $36 = ___async_retval; //@line 3061
  HEAP32[$36 >> 2] = $$0; //@line 3062
  return;
 }
 HEAP32[$18 >> 2] = 0; //@line 3065
 $22 = HEAP32[$10 >> 2] | 0; //@line 3066
 $25 = HEAP32[(HEAP32[$22 >> 2] | 0) + 60 >> 2] | 0; //@line 3069
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 3070
 $26 = FUNCTION_TABLE_iiiiii[$25 & 7]($22, $20, $2, $12, $14) | 0; //@line 3071
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 3074
  $27 = $ReallocAsyncCtx2 + 4 | 0; //@line 3075
  HEAP32[$27 >> 2] = $19; //@line 3076
  $28 = $ReallocAsyncCtx2 + 8 | 0; //@line 3077
  HEAP32[$28 >> 2] = $8; //@line 3078
  $29 = $ReallocAsyncCtx2 + 12 | 0; //@line 3079
  HEAP32[$29 >> 2] = $17; //@line 3080
  $30 = $ReallocAsyncCtx2 + 16 | 0; //@line 3081
  HEAP32[$30 >> 2] = $18; //@line 3082
  $31 = $ReallocAsyncCtx2 + 20 | 0; //@line 3083
  HEAP32[$31 >> 2] = $10; //@line 3084
  $32 = $ReallocAsyncCtx2 + 24 | 0; //@line 3085
  HEAP32[$32 >> 2] = $2; //@line 3086
  $33 = $ReallocAsyncCtx2 + 28 | 0; //@line 3087
  HEAP32[$33 >> 2] = $12; //@line 3088
  $34 = $ReallocAsyncCtx2 + 32 | 0; //@line 3089
  HEAP32[$34 >> 2] = $14; //@line 3090
  sp = STACKTOP; //@line 3091
  return;
 }
 HEAP32[___async_retval >> 2] = $26; //@line 3095
 ___async_unwind = 0; //@line 3096
 HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 3097
 $27 = $ReallocAsyncCtx2 + 4 | 0; //@line 3098
 HEAP32[$27 >> 2] = $19; //@line 3099
 $28 = $ReallocAsyncCtx2 + 8 | 0; //@line 3100
 HEAP32[$28 >> 2] = $8; //@line 3101
 $29 = $ReallocAsyncCtx2 + 12 | 0; //@line 3102
 HEAP32[$29 >> 2] = $17; //@line 3103
 $30 = $ReallocAsyncCtx2 + 16 | 0; //@line 3104
 HEAP32[$30 >> 2] = $18; //@line 3105
 $31 = $ReallocAsyncCtx2 + 20 | 0; //@line 3106
 HEAP32[$31 >> 2] = $10; //@line 3107
 $32 = $ReallocAsyncCtx2 + 24 | 0; //@line 3108
 HEAP32[$32 >> 2] = $2; //@line 3109
 $33 = $ReallocAsyncCtx2 + 28 | 0; //@line 3110
 HEAP32[$33 >> 2] = $12; //@line 3111
 $34 = $ReallocAsyncCtx2 + 32 | 0; //@line 3112
 HEAP32[$34 >> 2] = $14; //@line 3113
 sp = STACKTOP; //@line 3114
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_40($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1156
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1158
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1160
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1162
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1164
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1166
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1168
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1170
 $$pre = HEAP32[$2 >> 2] | 0; //@line 1171
 if ($$pre | 0) {
  $17 = HEAP32[$$pre + 4 >> 2] | 0; //@line 1175
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1176
  FUNCTION_TABLE_vii[$17 & 3]($6, $8); //@line 1177
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 59; //@line 1180
   $18 = $ReallocAsyncCtx4 + 4 | 0; //@line 1181
   HEAP32[$18 >> 2] = $2; //@line 1182
   $19 = $ReallocAsyncCtx4 + 8 | 0; //@line 1183
   HEAP32[$19 >> 2] = $4; //@line 1184
   $20 = $ReallocAsyncCtx4 + 12 | 0; //@line 1185
   HEAP32[$20 >> 2] = $8; //@line 1186
   $21 = $ReallocAsyncCtx4 + 16 | 0; //@line 1187
   HEAP32[$21 >> 2] = $10; //@line 1188
   $22 = $ReallocAsyncCtx4 + 20 | 0; //@line 1189
   HEAP32[$22 >> 2] = $12; //@line 1190
   $23 = $ReallocAsyncCtx4 + 24 | 0; //@line 1191
   HEAP32[$23 >> 2] = $6; //@line 1192
   $24 = $ReallocAsyncCtx4 + 28 | 0; //@line 1193
   HEAP32[$24 >> 2] = $14; //@line 1194
   sp = STACKTOP; //@line 1195
   return;
  }
  ___async_unwind = 0; //@line 1198
  HEAP32[$ReallocAsyncCtx4 >> 2] = 59; //@line 1199
  $18 = $ReallocAsyncCtx4 + 4 | 0; //@line 1200
  HEAP32[$18 >> 2] = $2; //@line 1201
  $19 = $ReallocAsyncCtx4 + 8 | 0; //@line 1202
  HEAP32[$19 >> 2] = $4; //@line 1203
  $20 = $ReallocAsyncCtx4 + 12 | 0; //@line 1204
  HEAP32[$20 >> 2] = $8; //@line 1205
  $21 = $ReallocAsyncCtx4 + 16 | 0; //@line 1206
  HEAP32[$21 >> 2] = $10; //@line 1207
  $22 = $ReallocAsyncCtx4 + 20 | 0; //@line 1208
  HEAP32[$22 >> 2] = $12; //@line 1209
  $23 = $ReallocAsyncCtx4 + 24 | 0; //@line 1210
  HEAP32[$23 >> 2] = $6; //@line 1211
  $24 = $ReallocAsyncCtx4 + 28 | 0; //@line 1212
  HEAP32[$24 >> 2] = $14; //@line 1213
  sp = STACKTOP; //@line 1214
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 1217
 $25 = HEAP32[$10 >> 2] | 0; //@line 1218
 $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 68 >> 2] | 0; //@line 1221
 $29 = HEAP32[$12 >> 2] | 0; //@line 1222
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 1223
 FUNCTION_TABLE_viiii[$28 & 7]($25, $29, 61, $6); //@line 1224
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1227
  $30 = $ReallocAsyncCtx6 + 4 | 0; //@line 1228
  HEAP32[$30 >> 2] = $14; //@line 1229
  sp = STACKTOP; //@line 1230
  return;
 }
 ___async_unwind = 0; //@line 1233
 HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1234
 $30 = $ReallocAsyncCtx6 + 4 | 0; //@line 1235
 HEAP32[$30 >> 2] = $14; //@line 1236
 sp = STACKTOP; //@line 1237
 return;
}
function __ZN9UDPSocket6sendtoEPKctPKvj__async_cb_72($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3122
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3124
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3126
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3128
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3130
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3132
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3134
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3136
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3138
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3140
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$0 = $AsyncRetVal; //@line 3146
  $37 = ___async_retval; //@line 3147
  HEAP32[$37 >> 2] = $$0; //@line 3148
  return;
 }
 $18 = HEAP32[$6 >> 2] | 0; //@line 3151
 if (!$18) {
  $$0 = -3005; //@line 3154
  $37 = ___async_retval; //@line 3155
  HEAP32[$37 >> 2] = $$0; //@line 3156
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 3159
 $20 = HEAP32[$10 >> 2] | 0; //@line 3160
 $23 = HEAP32[(HEAP32[$20 >> 2] | 0) + 60 >> 2] | 0; //@line 3163
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 3164
 $24 = FUNCTION_TABLE_iiiiii[$23 & 7]($20, $18, $12, $14, $16) | 0; //@line 3165
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 3168
  $25 = $ReallocAsyncCtx2 + 4 | 0; //@line 3169
  HEAP32[$25 >> 2] = $2; //@line 3170
  $26 = $ReallocAsyncCtx2 + 8 | 0; //@line 3171
  HEAP32[$26 >> 2] = $4; //@line 3172
  $27 = $ReallocAsyncCtx2 + 12 | 0; //@line 3173
  HEAP32[$27 >> 2] = $6; //@line 3174
  $28 = $ReallocAsyncCtx2 + 16 | 0; //@line 3175
  HEAP32[$28 >> 2] = $8; //@line 3176
  $29 = $ReallocAsyncCtx2 + 20 | 0; //@line 3177
  HEAP32[$29 >> 2] = $10; //@line 3178
  $30 = $ReallocAsyncCtx2 + 24 | 0; //@line 3179
  HEAP32[$30 >> 2] = $12; //@line 3180
  $31 = $ReallocAsyncCtx2 + 28 | 0; //@line 3181
  HEAP32[$31 >> 2] = $14; //@line 3182
  $32 = $ReallocAsyncCtx2 + 32 | 0; //@line 3183
  HEAP32[$32 >> 2] = $16; //@line 3184
  sp = STACKTOP; //@line 3185
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 3189
 ___async_unwind = 0; //@line 3190
 HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 3191
 $25 = $ReallocAsyncCtx2 + 4 | 0; //@line 3192
 HEAP32[$25 >> 2] = $2; //@line 3193
 $26 = $ReallocAsyncCtx2 + 8 | 0; //@line 3194
 HEAP32[$26 >> 2] = $4; //@line 3195
 $27 = $ReallocAsyncCtx2 + 12 | 0; //@line 3196
 HEAP32[$27 >> 2] = $6; //@line 3197
 $28 = $ReallocAsyncCtx2 + 16 | 0; //@line 3198
 HEAP32[$28 >> 2] = $8; //@line 3199
 $29 = $ReallocAsyncCtx2 + 20 | 0; //@line 3200
 HEAP32[$29 >> 2] = $10; //@line 3201
 $30 = $ReallocAsyncCtx2 + 24 | 0; //@line 3202
 HEAP32[$30 >> 2] = $12; //@line 3203
 $31 = $ReallocAsyncCtx2 + 28 | 0; //@line 3204
 HEAP32[$31 >> 2] = $14; //@line 3205
 $32 = $ReallocAsyncCtx2 + 32 | 0; //@line 3206
 HEAP32[$32 >> 2] = $16; //@line 3207
 sp = STACKTOP; //@line 3208
 return;
}
function _mbrtowc($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0 = 0, $$03952 = 0, $$04051 = 0, $$04350 = 0, $$1 = 0, $$141 = 0, $$144 = 0, $$2 = 0, $$47 = 0, $12 = 0, $21 = 0, $22 = 0, $26 = 0, $30 = 0, $31 = 0, $33 = 0, $35 = 0, $4 = 0, $44 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9
 STACKTOP = STACKTOP + 16 | 0; //@line 10
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10
 $4 = sp; //@line 11
 $$ = ($3 | 0) == 0 ? 6524 : $3; //@line 13
 $6 = HEAP32[$$ >> 2] | 0; //@line 14
 L1 : do {
  if (!$1) {
   if (!$6) {
    $$0 = 0; //@line 20
   } else {
    label = 17; //@line 22
   }
  } else {
   $$47 = ($0 | 0) == 0 ? $4 : $0; //@line 26
   if (!$2) {
    $$0 = -2; //@line 29
   } else {
    if (!$6) {
     $12 = HEAP8[$1 >> 0] | 0; //@line 33
     if ($12 << 24 >> 24 > -1) {
      HEAP32[$$47 >> 2] = $12 & 255; //@line 37
      $$0 = $12 << 24 >> 24 != 0 & 1; //@line 40
      break;
     }
     $21 = (HEAP32[HEAP32[(___pthread_self_913() | 0) + 188 >> 2] >> 2] | 0) == 0; //@line 47
     $22 = HEAP8[$1 >> 0] | 0; //@line 48
     if ($21) {
      HEAP32[$$47 >> 2] = $22 << 24 >> 24 & 57343; //@line 52
      $$0 = 1; //@line 53
      break;
     }
     $26 = ($22 & 255) + -194 | 0; //@line 57
     if ($26 >>> 0 > 50) {
      label = 17; //@line 60
      break;
     }
     $30 = HEAP32[816 + ($26 << 2) >> 2] | 0; //@line 65
     $31 = $2 + -1 | 0; //@line 66
     if (!$31) {
      $$2 = $30; //@line 69
     } else {
      $$03952 = $1 + 1 | 0; //@line 71
      $$04051 = $30; //@line 71
      $$04350 = $31; //@line 71
      label = 11; //@line 72
     }
    } else {
     $$03952 = $1; //@line 75
     $$04051 = $6; //@line 75
     $$04350 = $2; //@line 75
     label = 11; //@line 76
    }
    L14 : do {
     if ((label | 0) == 11) {
      $33 = HEAP8[$$03952 >> 0] | 0; //@line 80
      $35 = ($33 & 255) >>> 3; //@line 82
      if (($35 + -16 | $35 + ($$04051 >> 26)) >>> 0 > 7) {
       label = 17; //@line 89
       break L1;
      } else {
       $$1 = $$03952; //@line 92
       $$141 = $$04051; //@line 92
       $$144 = $$04350; //@line 92
       $44 = $33; //@line 92
      }
      while (1) {
       $$1 = $$1 + 1 | 0; //@line 96
       $$141 = ($44 & 255) + -128 | $$141 << 6; //@line 99
       $$144 = $$144 + -1 | 0; //@line 100
       if (($$141 | 0) >= 0) {
        break;
       }
       if (!$$144) {
        $$2 = $$141; //@line 107
        break L14;
       }
       $44 = HEAP8[$$1 >> 0] | 0; //@line 110
       if (($44 & -64) << 24 >> 24 != -128) {
        label = 17; //@line 116
        break L1;
       }
      }
      HEAP32[$$ >> 2] = 0; //@line 120
      HEAP32[$$47 >> 2] = $$141; //@line 121
      $$0 = $2 - $$144 | 0; //@line 123
      break L1;
     }
    } while (0);
    HEAP32[$$ >> 2] = $$2; //@line 127
    $$0 = -2; //@line 128
   }
  }
 } while (0);
 if ((label | 0) == 17) {
  HEAP32[$$ >> 2] = 0; //@line 133
  HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 135
  $$0 = -1; //@line 136
 }
 STACKTOP = sp; //@line 138
 return $$0 | 0; //@line 138
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$1 = 0, $13 = 0, $14 = 0, $21 = 0, $28 = 0, $29 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 386
 $5 = $1 + 8 | 0; //@line 387
 do {
  if (!(HEAP8[$5 >> 0] | 0)) {
   label = 7; //@line 392
  } else {
   if (!(__ZneRK13SocketAddressS1_($1 + 12 | 0, $2) | 0)) {
    if (!(HEAP8[$5 >> 0] | 0)) {
     label = 7; //@line 400
     break;
    } else {
     break;
    }
   }
   $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 406
   _puts(1552) | 0; //@line 407
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 29; //@line 410
    sp = STACKTOP; //@line 411
    return 0; //@line 412
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 414
   $$1 = -3012; //@line 415
   return $$1 | 0; //@line 416
  }
 } while (0);
 do {
  if ((label | 0) == 7) {
   $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 423
   $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 424
   $14 = FUNCTION_TABLE_iiii[$13 & 15]($0, $1, $2) | 0; //@line 425
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 30; //@line 428
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 430
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 432
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 434
    HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 436
    HEAP32[$AsyncCtx + 20 >> 2] = $4; //@line 438
    sp = STACKTOP; //@line 439
    return 0; //@line 440
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 442
   if (($14 | 0) < 0) {
    $$1 = $14; //@line 445
    return $$1 | 0; //@line 446
   } else {
    $21 = $1 + 12 | 0; //@line 448
    dest = $21; //@line 449
    src = $2; //@line 449
    stop = dest + 60 | 0; //@line 449
    do {
     HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 449
     dest = dest + 4 | 0; //@line 449
     src = src + 4 | 0; //@line 449
    } while ((dest | 0) < (stop | 0));
    HEAP16[$21 + 60 >> 1] = HEAP16[$2 + 60 >> 1] | 0; //@line 449
    break;
   }
  }
 } while (0);
 $AsyncCtx10 = _emscripten_alloc_async_context(20, sp) | 0; //@line 454
 _wait_ms(1); //@line 455
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 31; //@line 458
  HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 460
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 462
  HEAP32[$AsyncCtx10 + 12 >> 2] = $3; //@line 464
  HEAP32[$AsyncCtx10 + 16 >> 2] = $4; //@line 466
  sp = STACKTOP; //@line 467
  return 0; //@line 468
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 470
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 473
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 474
 $29 = FUNCTION_TABLE_iiiii[$28 & 15]($0, $1, $3, $4) | 0; //@line 475
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 32; //@line 478
  sp = STACKTOP; //@line 479
  return 0; //@line 480
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 482
 $$1 = $29; //@line 483
 return $$1 | 0; //@line 484
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9810
 STACKTOP = STACKTOP + 48 | 0; //@line 9811
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 9811
 $vararg_buffer3 = sp + 16 | 0; //@line 9812
 $vararg_buffer = sp; //@line 9813
 $3 = sp + 32 | 0; //@line 9814
 $4 = $0 + 28 | 0; //@line 9815
 $5 = HEAP32[$4 >> 2] | 0; //@line 9816
 HEAP32[$3 >> 2] = $5; //@line 9817
 $7 = $0 + 20 | 0; //@line 9819
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 9821
 HEAP32[$3 + 4 >> 2] = $9; //@line 9822
 HEAP32[$3 + 8 >> 2] = $1; //@line 9824
 HEAP32[$3 + 12 >> 2] = $2; //@line 9826
 $12 = $9 + $2 | 0; //@line 9827
 $13 = $0 + 60 | 0; //@line 9828
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 9831
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 9833
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 9835
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 9837
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 9841
  } else {
   $$04756 = 2; //@line 9843
   $$04855 = $12; //@line 9843
   $$04954 = $3; //@line 9843
   $27 = $17; //@line 9843
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 9849
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 9851
    $38 = $27 >>> 0 > $37 >>> 0; //@line 9852
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 9854
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 9856
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 9858
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 9861
    $44 = $$150 + 4 | 0; //@line 9862
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 9865
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 9868
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 9870
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 9872
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 9874
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 9877
     break L1;
    } else {
     $$04756 = $$1; //@line 9880
     $$04954 = $$150; //@line 9880
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 9884
   HEAP32[$4 >> 2] = 0; //@line 9885
   HEAP32[$7 >> 2] = 0; //@line 9886
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 9889
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 9892
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 9897
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 9903
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 9908
  $25 = $20; //@line 9909
  HEAP32[$4 >> 2] = $25; //@line 9910
  HEAP32[$7 >> 2] = $25; //@line 9911
  $$051 = $2; //@line 9912
 }
 STACKTOP = sp; //@line 9914
 return $$051 | 0; //@line 9914
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$09 = 0, $$1 = 0, $$byval_copy = 0, $12 = 0, $13 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1075
 STACKTOP = STACKTOP + 112 | 0; //@line 1076
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(112); //@line 1076
 $$byval_copy = sp + 88 | 0; //@line 1077
 $4 = sp + 24 | 0; //@line 1078
 $5 = sp; //@line 1079
 $7 = ($3 | 0) == 0; //@line 1081
 if (__ZN13SocketAddress14set_ip_addressEPKc($2, $1) | 0) {
  if (!$7) {
   if ((__ZNK13SocketAddress14get_ip_versionEv($2) | 0) != ($3 | 0)) {
    $$09 = -3009; //@line 1087
    STACKTOP = sp; //@line 1088
    return $$09 | 0; //@line 1088
   }
  }
  $$09 = 0; //@line 1091
  STACKTOP = sp; //@line 1092
  return $$09 | 0; //@line 1092
 }
 if ($7) {
  HEAP32[$5 >> 2] = 0; //@line 1095
  HEAP32[$5 + 4 >> 2] = 0; //@line 1095
  HEAP32[$5 + 8 >> 2] = 0; //@line 1095
  HEAP32[$5 + 12 >> 2] = 0; //@line 1095
  HEAP32[$5 + 16 >> 2] = 0; //@line 1095
  HEAP32[$$byval_copy >> 2] = HEAP32[$5 >> 2]; //@line 1096
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$5 + 4 >> 2]; //@line 1096
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$5 + 8 >> 2]; //@line 1096
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$5 + 12 >> 2]; //@line 1096
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$5 + 16 >> 2]; //@line 1096
  __ZN13SocketAddressC2E10nsapi_addrt($4, $$byval_copy, 0); //@line 1097
  $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 1100
  $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1101
  $13 = FUNCTION_TABLE_ii[$12 & 15]($0) | 0; //@line 1102
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 52; //@line 1105
   HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1107
   HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 1109
   HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1111
   HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1113
   HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 1115
   HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 1117
   sp = STACKTOP; //@line 1118
   STACKTOP = sp; //@line 1119
   return 0; //@line 1119
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1121
  if (__ZN13SocketAddress14set_ip_addressEPKc($4, $13) | 0) {
   $$0 = __ZNK13SocketAddress14get_ip_versionEv($4) | 0; //@line 1125
  } else {
   $$0 = 0; //@line 1127
  }
  $$1 = $$0; //@line 1129
 } else {
  $$1 = $3; //@line 1131
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1133
 $22 = __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($0, $1, $2, $$1) | 0; //@line 1134
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 53; //@line 1137
  sp = STACKTOP; //@line 1138
  STACKTOP = sp; //@line 1139
  return 0; //@line 1139
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1141
 $$09 = $22; //@line 1142
 STACKTOP = sp; //@line 1143
 return $$09 | 0; //@line 1143
}
function __ZN9UDPSocket8recvfromEP13SocketAddressPvj__async_cb($0) {
 $0 = $0 | 0;
 var $$2 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1564
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1566
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1568
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1570
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1572
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1574
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1576
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1578
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1580
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$2 = $AsyncRetVal; //@line 1586
  $34 = ___async_retval; //@line 1587
  HEAP32[$34 >> 2] = $$2; //@line 1588
  return;
 }
 $16 = HEAP32[$4 >> 2] | 0; //@line 1591
 if (!$16) {
  $$2 = -3005; //@line 1594
  $34 = ___async_retval; //@line 1595
  HEAP32[$34 >> 2] = $$2; //@line 1596
  return;
 }
 HEAP32[$6 >> 2] = 0; //@line 1599
 $18 = HEAP32[$8 >> 2] | 0; //@line 1600
 $21 = HEAP32[(HEAP32[$18 >> 2] | 0) + 64 >> 2] | 0; //@line 1603
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 1604
 $22 = FUNCTION_TABLE_iiiiii[$21 & 7]($18, $16, $10, $12, $14) | 0; //@line 1605
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 77; //@line 1608
  $23 = $ReallocAsyncCtx + 4 | 0; //@line 1609
  HEAP32[$23 >> 2] = $2; //@line 1610
  $24 = $ReallocAsyncCtx + 8 | 0; //@line 1611
  HEAP32[$24 >> 2] = $4; //@line 1612
  $25 = $ReallocAsyncCtx + 12 | 0; //@line 1613
  HEAP32[$25 >> 2] = $6; //@line 1614
  $26 = $ReallocAsyncCtx + 16 | 0; //@line 1615
  HEAP32[$26 >> 2] = $8; //@line 1616
  $27 = $ReallocAsyncCtx + 20 | 0; //@line 1617
  HEAP32[$27 >> 2] = $10; //@line 1618
  $28 = $ReallocAsyncCtx + 24 | 0; //@line 1619
  HEAP32[$28 >> 2] = $12; //@line 1620
  $29 = $ReallocAsyncCtx + 28 | 0; //@line 1621
  HEAP32[$29 >> 2] = $14; //@line 1622
  sp = STACKTOP; //@line 1623
  return;
 }
 HEAP32[___async_retval >> 2] = $22; //@line 1627
 ___async_unwind = 0; //@line 1628
 HEAP32[$ReallocAsyncCtx >> 2] = 77; //@line 1629
 $23 = $ReallocAsyncCtx + 4 | 0; //@line 1630
 HEAP32[$23 >> 2] = $2; //@line 1631
 $24 = $ReallocAsyncCtx + 8 | 0; //@line 1632
 HEAP32[$24 >> 2] = $4; //@line 1633
 $25 = $ReallocAsyncCtx + 12 | 0; //@line 1634
 HEAP32[$25 >> 2] = $6; //@line 1635
 $26 = $ReallocAsyncCtx + 16 | 0; //@line 1636
 HEAP32[$26 >> 2] = $8; //@line 1637
 $27 = $ReallocAsyncCtx + 20 | 0; //@line 1638
 HEAP32[$27 >> 2] = $10; //@line 1639
 $28 = $ReallocAsyncCtx + 24 | 0; //@line 1640
 HEAP32[$28 >> 2] = $12; //@line 1641
 $29 = $ReallocAsyncCtx + 28 | 0; //@line 1642
 HEAP32[$29 >> 2] = $14; //@line 1643
 sp = STACKTOP; //@line 1644
 return;
}
function __ZN9UDPSocket6sendtoERK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $$2 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1962
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1964
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1966
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1968
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1970
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1972
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1974
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1976
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1978
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$2 = $AsyncRetVal; //@line 1984
  $34 = ___async_retval; //@line 1985
  HEAP32[$34 >> 2] = $$2; //@line 1986
  return;
 }
 $16 = HEAP32[$4 >> 2] | 0; //@line 1989
 if (!$16) {
  $$2 = -3005; //@line 1992
  $34 = ___async_retval; //@line 1993
  HEAP32[$34 >> 2] = $$2; //@line 1994
  return;
 }
 HEAP32[$6 >> 2] = 0; //@line 1997
 $18 = HEAP32[$8 >> 2] | 0; //@line 1998
 $21 = HEAP32[(HEAP32[$18 >> 2] | 0) + 60 >> 2] | 0; //@line 2001
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 2002
 $22 = FUNCTION_TABLE_iiiiii[$21 & 7]($18, $16, $10, $12, $14) | 0; //@line 2003
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 76; //@line 2006
  $23 = $ReallocAsyncCtx + 4 | 0; //@line 2007
  HEAP32[$23 >> 2] = $2; //@line 2008
  $24 = $ReallocAsyncCtx + 8 | 0; //@line 2009
  HEAP32[$24 >> 2] = $4; //@line 2010
  $25 = $ReallocAsyncCtx + 12 | 0; //@line 2011
  HEAP32[$25 >> 2] = $6; //@line 2012
  $26 = $ReallocAsyncCtx + 16 | 0; //@line 2013
  HEAP32[$26 >> 2] = $8; //@line 2014
  $27 = $ReallocAsyncCtx + 20 | 0; //@line 2015
  HEAP32[$27 >> 2] = $10; //@line 2016
  $28 = $ReallocAsyncCtx + 24 | 0; //@line 2017
  HEAP32[$28 >> 2] = $12; //@line 2018
  $29 = $ReallocAsyncCtx + 28 | 0; //@line 2019
  HEAP32[$29 >> 2] = $14; //@line 2020
  sp = STACKTOP; //@line 2021
  return;
 }
 HEAP32[___async_retval >> 2] = $22; //@line 2025
 ___async_unwind = 0; //@line 2026
 HEAP32[$ReallocAsyncCtx >> 2] = 76; //@line 2027
 $23 = $ReallocAsyncCtx + 4 | 0; //@line 2028
 HEAP32[$23 >> 2] = $2; //@line 2029
 $24 = $ReallocAsyncCtx + 8 | 0; //@line 2030
 HEAP32[$24 >> 2] = $4; //@line 2031
 $25 = $ReallocAsyncCtx + 12 | 0; //@line 2032
 HEAP32[$25 >> 2] = $6; //@line 2033
 $26 = $ReallocAsyncCtx + 16 | 0; //@line 2034
 HEAP32[$26 >> 2] = $8; //@line 2035
 $27 = $ReallocAsyncCtx + 20 | 0; //@line 2036
 HEAP32[$27 >> 2] = $10; //@line 2037
 $28 = $ReallocAsyncCtx + 24 | 0; //@line 2038
 HEAP32[$28 >> 2] = $12; //@line 2039
 $29 = $ReallocAsyncCtx + 28 | 0; //@line 2040
 HEAP32[$29 >> 2] = $14; //@line 2041
 sp = STACKTOP; //@line 2042
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_41($0) {
 $0 = $0 | 0;
 var $$pre$i$i = 0, $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $28 = 0, $29 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1244
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1250
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1252
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1254
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1256
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1258
 $$pre$i$i = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1259
 $15 = $$pre$i$i; //@line 1260
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i; //@line 1261
 if (!$$pre$i$i) {
  $24 = HEAP32[$8 >> 2] | 0; //@line 1264
  $27 = HEAP32[(HEAP32[$24 >> 2] | 0) + 68 >> 2] | 0; //@line 1267
  $28 = HEAP32[$10 >> 2] | 0; //@line 1268
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 1269
  FUNCTION_TABLE_viiii[$27 & 7]($24, $28, 61, $12); //@line 1270
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1273
   $29 = $ReallocAsyncCtx6 + 4 | 0; //@line 1274
   HEAP32[$29 >> 2] = $14; //@line 1275
   sp = STACKTOP; //@line 1276
   return;
  }
  ___async_unwind = 0; //@line 1279
  HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1280
  $29 = $ReallocAsyncCtx6 + 4 | 0; //@line 1281
  HEAP32[$29 >> 2] = $14; //@line 1282
  sp = STACKTOP; //@line 1283
  return;
 } else {
  $18 = HEAP32[$15 + 8 >> 2] | 0; //@line 1287
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 1288
  FUNCTION_TABLE_vi[$18 & 255]($6); //@line 1289
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 60; //@line 1292
   $19 = $ReallocAsyncCtx5 + 4 | 0; //@line 1293
   HEAP32[$19 >> 2] = $6; //@line 1294
   $20 = $ReallocAsyncCtx5 + 8 | 0; //@line 1295
   HEAP32[$20 >> 2] = $8; //@line 1296
   $21 = $ReallocAsyncCtx5 + 12 | 0; //@line 1297
   HEAP32[$21 >> 2] = $10; //@line 1298
   $22 = $ReallocAsyncCtx5 + 16 | 0; //@line 1299
   HEAP32[$22 >> 2] = $12; //@line 1300
   $23 = $ReallocAsyncCtx5 + 20 | 0; //@line 1301
   HEAP32[$23 >> 2] = $14; //@line 1302
   sp = STACKTOP; //@line 1303
   return;
  }
  ___async_unwind = 0; //@line 1306
  HEAP32[$ReallocAsyncCtx5 >> 2] = 60; //@line 1307
  $19 = $ReallocAsyncCtx5 + 4 | 0; //@line 1308
  HEAP32[$19 >> 2] = $6; //@line 1309
  $20 = $ReallocAsyncCtx5 + 8 | 0; //@line 1310
  HEAP32[$20 >> 2] = $8; //@line 1311
  $21 = $ReallocAsyncCtx5 + 12 | 0; //@line 1312
  HEAP32[$21 >> 2] = $10; //@line 1313
  $22 = $ReallocAsyncCtx5 + 16 | 0; //@line 1314
  HEAP32[$22 >> 2] = $12; //@line 1315
  $23 = $ReallocAsyncCtx5 + 20 | 0; //@line 1316
  HEAP32[$23 >> 2] = $14; //@line 1317
  sp = STACKTOP; //@line 1318
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3641
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3645
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3647
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3649
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3651
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3653
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3655
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3657
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3659
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3661
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3664
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3666
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 3670
   $27 = $6 + 24 | 0; //@line 3671
   $28 = $4 + 8 | 0; //@line 3672
   $29 = $6 + 54 | 0; //@line 3673
   if (!(HEAP8[$29 >> 0] | 0)) {
    if (!(HEAP8[$10 >> 0] | 0)) {
     if (HEAP8[$14 >> 0] | 0) {
      if (!(HEAP32[$28 >> 2] & 1)) {
       break;
      }
     }
    } else {
     if ((HEAP32[$27 >> 2] | 0) == 1) {
      break;
     }
     if (!(HEAP32[$28 >> 2] & 2)) {
      break;
     }
    }
    HEAP8[$10 >> 0] = 0; //@line 3703
    HEAP8[$14 >> 0] = 0; //@line 3704
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3705
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 3706
    if (!___async) {
     ___async_unwind = 0; //@line 3709
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 3711
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 3713
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 3715
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 3717
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3719
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3721
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3723
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3725
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 3727
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 3729
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 3731
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 3733
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 3735
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 3737
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 3740
    sp = STACKTOP; //@line 3741
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3746
 HEAP8[$14 >> 0] = $12; //@line 3747
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3525
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3529
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3531
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3533
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3535
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3537
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3539
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3541
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3543
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3545
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3547
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3549
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3551
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 3554
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3555
 do {
  if ($43 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if (!(HEAP8[$10 >> 0] | 0)) {
     if (HEAP8[$14 >> 0] | 0) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       break;
      }
     }
    } else {
     if ((HEAP32[$16 >> 2] | 0) == 1) {
      break;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      break;
     }
    }
    HEAP8[$10 >> 0] = 0; //@line 3588
    HEAP8[$14 >> 0] = 0; //@line 3589
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3590
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 3591
    if (!___async) {
     ___async_unwind = 0; //@line 3594
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 3596
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 3598
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3600
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3602
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3604
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3606
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3608
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3610
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 3612
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 3614
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 3616
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 3618
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 3620
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 3622
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 3625
    sp = STACKTOP; //@line 3626
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3631
 HEAP8[$14 >> 0] = $12; //@line 3632
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 4581
 }
 ret = dest | 0; //@line 4584
 dest_end = dest + num | 0; //@line 4585
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 4589
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 4590
   dest = dest + 1 | 0; //@line 4591
   src = src + 1 | 0; //@line 4592
   num = num - 1 | 0; //@line 4593
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 4595
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 4596
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 4598
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 4599
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 4600
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 4601
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 4602
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 4603
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 4604
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 4605
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 4606
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 4607
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 4608
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 4609
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 4610
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 4611
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 4612
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 4613
   dest = dest + 64 | 0; //@line 4614
   src = src + 64 | 0; //@line 4615
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 4618
   dest = dest + 4 | 0; //@line 4619
   src = src + 4 | 0; //@line 4620
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 4624
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 4626
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 4627
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 4628
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 4629
   dest = dest + 4 | 0; //@line 4630
   src = src + 4 | 0; //@line 4631
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 4636
  dest = dest + 1 | 0; //@line 4637
  src = src + 1 | 0; //@line 4638
 }
 return ret | 0; //@line 4640
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $29 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8825
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8827
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8829
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8833
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8835
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8837
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8839
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8841
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8843
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8845
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8847
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8849
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 8851
 __ZN17EthernetInterfaceC2Ev($4); //@line 8852
 if (!(__ZN17EthernetInterface7connectEv($4) | 0)) {
  $ReallocAsyncCtx11 = _emscripten_realloc_async_context(56) | 0; //@line 8856
  $30 = __ZN17EthernetInterface14get_ip_addressEv($4) | 0; //@line 8857
  if (!___async) {
   HEAP32[___async_retval >> 2] = $30; //@line 8861
   ___async_unwind = 0; //@line 8862
  }
  HEAP32[$ReallocAsyncCtx11 >> 2] = 118; //@line 8864
  HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 8866
  HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 8868
  HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 8870
  HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 8872
  HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $20; //@line 8874
  HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $22; //@line 8876
  HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $16; //@line 8878
  HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $18; //@line 8880
  HEAP32[$ReallocAsyncCtx11 + 36 >> 2] = $24; //@line 8882
  HEAP32[$ReallocAsyncCtx11 + 40 >> 2] = $26; //@line 8884
  HEAP32[$ReallocAsyncCtx11 + 44 >> 2] = $10; //@line 8886
  HEAP32[$ReallocAsyncCtx11 + 48 >> 2] = $12; //@line 8888
  HEAP32[$ReallocAsyncCtx11 + 52 >> 2] = $14; //@line 8890
  sp = STACKTOP; //@line 8891
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8894
 _puts(2528) | 0; //@line 8895
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 117; //@line 8898
  $29 = $ReallocAsyncCtx + 4 | 0; //@line 8899
  HEAP32[$29 >> 2] = $4; //@line 8900
  sp = STACKTOP; //@line 8901
  return;
 }
 ___async_unwind = 0; //@line 8904
 HEAP32[$ReallocAsyncCtx >> 2] = 117; //@line 8905
 $29 = $ReallocAsyncCtx + 4 | 0; //@line 8906
 HEAP32[$29 >> 2] = $4; //@line 8907
 sp = STACKTOP; //@line 8908
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6636
 STACKTOP = STACKTOP + 64 | 0; //@line 6637
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6637
 $3 = sp; //@line 6638
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 6641
 } else {
  if (!$1) {
   $$2 = 0; //@line 6645
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 6647
   $6 = ___dynamic_cast($1, 104, 88, 0) | 0; //@line 6648
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 151; //@line 6651
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 6653
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6655
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 6657
    sp = STACKTOP; //@line 6658
    STACKTOP = sp; //@line 6659
    return 0; //@line 6659
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6661
   if (!$6) {
    $$2 = 0; //@line 6664
   } else {
    dest = $3 + 4 | 0; //@line 6667
    stop = dest + 52 | 0; //@line 6667
    do {
     HEAP32[dest >> 2] = 0; //@line 6667
     dest = dest + 4 | 0; //@line 6667
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 6668
    HEAP32[$3 + 8 >> 2] = $0; //@line 6670
    HEAP32[$3 + 12 >> 2] = -1; //@line 6672
    HEAP32[$3 + 48 >> 2] = 1; //@line 6674
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 6677
    $18 = HEAP32[$2 >> 2] | 0; //@line 6678
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6679
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 6680
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 152; //@line 6683
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 6685
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 6687
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6689
     sp = STACKTOP; //@line 6690
     STACKTOP = sp; //@line 6691
     return 0; //@line 6691
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6693
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 6700
     $$0 = 1; //@line 6701
    } else {
     $$0 = 0; //@line 6703
    }
    $$2 = $$0; //@line 6705
   }
  }
 }
 STACKTOP = sp; //@line 6709
 return $$2 | 0; //@line 6709
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$i = 0, $$byval_copy = 0, $3 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 586
 STACKTOP = STACKTOP + 48 | 0; //@line 587
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 587
 $$byval_copy = sp + 20 | 0; //@line 588
 $3 = sp; //@line 589
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 590
 $4 = __Znwj(76) | 0; //@line 591
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 594
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 596
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 598
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 600
  sp = STACKTOP; //@line 601
  STACKTOP = sp; //@line 602
  return 0; //@line 602
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 604
 dest = $4; //@line 605
 stop = dest + 76 | 0; //@line 605
 do {
  HEAP32[dest >> 2] = 0; //@line 605
  dest = dest + 4 | 0; //@line 605
 } while ((dest | 0) < (stop | 0));
 $8 = $4 + 12 | 0; //@line 606
 HEAP32[$3 >> 2] = 0; //@line 607
 HEAP32[$3 + 4 >> 2] = 0; //@line 607
 HEAP32[$3 + 8 >> 2] = 0; //@line 607
 HEAP32[$3 + 12 >> 2] = 0; //@line 607
 HEAP32[$3 + 16 >> 2] = 0; //@line 607
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2]; //@line 608
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$3 + 4 >> 2]; //@line 608
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$3 + 8 >> 2]; //@line 608
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$3 + 12 >> 2]; //@line 608
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 608
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 609
 $9 = _emscripten_asm_const_ii(3, $2 | 0) | 0; //@line 610
 if (($9 | 0) == -1) {
  $$0$i = -3001; //@line 613
  STACKTOP = sp; //@line 614
  return $$0$i | 0; //@line 614
 }
 HEAP32[$4 >> 2] = $9; //@line 616
 HEAP8[$4 + 8 >> 0] = 0; //@line 618
 HEAP32[$4 + 4 >> 2] = $2; //@line 620
 HEAP32[$1 >> 2] = $4; //@line 621
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 622
 _wait_ms(1); //@line 623
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 37; //@line 626
  sp = STACKTOP; //@line 627
  STACKTOP = sp; //@line 628
  return 0; //@line 628
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 630
 $$0$i = 0; //@line 631
 STACKTOP = sp; //@line 632
 return $$0$i | 0; //@line 632
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $31 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8916
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8918
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8920
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8922
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8924
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8926
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8928
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8930
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8932
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8934
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8936
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8938
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8940
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 8942
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 8944
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 8946
 HEAP8[$16 >> 0] = HEAP8[2570] | 0; //@line 8947
 HEAP8[$16 + 1 >> 0] = HEAP8[2571] | 0; //@line 8947
 HEAP8[$16 + 2 >> 0] = HEAP8[2572] | 0; //@line 8947
 HEAP8[$16 + 3 >> 0] = HEAP8[2573] | 0; //@line 8947
 HEAP8[$16 + 4 >> 0] = HEAP8[2574] | 0; //@line 8947
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(64) | 0; //@line 8948
 $31 = __ZN9UDPSocket6sendtoEPKctPKvj($6, 2575, 37, $16, 5) | 0; //@line 8949
 if (!___async) {
  HEAP32[___async_retval >> 2] = $31; //@line 8953
  ___async_unwind = 0; //@line 8954
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 120; //@line 8956
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 8958
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 8960
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 8962
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 8964
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 8966
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 8968
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 8970
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 8972
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 8974
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 8976
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 8978
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 8980
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 8982
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 8984
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 8986
 sp = STACKTOP; //@line 8987
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7968
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7974
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 7978
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 7979
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 7980
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 7981
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 168; //@line 7984
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 7986
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7988
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7990
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 7992
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 7994
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 7996
    sp = STACKTOP; //@line 7997
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8000
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 8004
    $$0 = $0 + 24 | 0; //@line 8005
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 8007
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 8008
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 8013
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 8019
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 8022
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 169; //@line 8027
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 8029
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 8031
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 8033
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 8035
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 8037
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 8039
    sp = STACKTOP; //@line 8040
    return;
   }
  }
 } while (0);
 return;
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$byval_copy = 0, $3 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 189
 STACKTOP = STACKTOP + 48 | 0; //@line 190
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 190
 $$byval_copy = sp + 20 | 0; //@line 191
 $3 = sp; //@line 192
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 193
 $4 = __Znwj(76) | 0; //@line 194
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 197
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 199
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 201
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 203
  sp = STACKTOP; //@line 204
  STACKTOP = sp; //@line 205
  return 0; //@line 205
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 207
 dest = $4; //@line 208
 stop = dest + 76 | 0; //@line 208
 do {
  HEAP32[dest >> 2] = 0; //@line 208
  dest = dest + 4 | 0; //@line 208
 } while ((dest | 0) < (stop | 0));
 $8 = $4 + 12 | 0; //@line 209
 HEAP32[$3 >> 2] = 0; //@line 210
 HEAP32[$3 + 4 >> 2] = 0; //@line 210
 HEAP32[$3 + 8 >> 2] = 0; //@line 210
 HEAP32[$3 + 12 >> 2] = 0; //@line 210
 HEAP32[$3 + 16 >> 2] = 0; //@line 210
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2]; //@line 211
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$3 + 4 >> 2]; //@line 211
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$3 + 8 >> 2]; //@line 211
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$3 + 12 >> 2]; //@line 211
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 211
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 212
 $9 = _emscripten_asm_const_ii(3, $2 | 0) | 0; //@line 213
 if (($9 | 0) == -1) {
  $$0 = -3001; //@line 216
  STACKTOP = sp; //@line 217
  return $$0 | 0; //@line 217
 }
 HEAP32[$4 >> 2] = $9; //@line 219
 HEAP8[$4 + 8 >> 0] = 0; //@line 221
 HEAP32[$4 + 4 >> 2] = $2; //@line 223
 HEAP32[$1 >> 2] = $4; //@line 224
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 225
 _wait_ms(1); //@line 226
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 229
  sp = STACKTOP; //@line 230
  STACKTOP = sp; //@line 231
  return 0; //@line 231
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 233
 $$0 = 0; //@line 234
 STACKTOP = sp; //@line 235
 return $$0 | 0; //@line 235
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 5983
 STACKTOP = STACKTOP + 128 | 0; //@line 5984
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 5984
 $4 = sp + 124 | 0; //@line 5985
 $5 = sp; //@line 5986
 dest = $5; //@line 5987
 src = 1304; //@line 5987
 stop = dest + 124 | 0; //@line 5987
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5987
  dest = dest + 4 | 0; //@line 5987
  src = src + 4 | 0; //@line 5987
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 5993
   $$015 = 1; //@line 5993
   label = 4; //@line 5994
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 5997
   $$0 = -1; //@line 5998
  }
 } else {
  $$014 = $0; //@line 6001
  $$015 = $1; //@line 6001
  label = 4; //@line 6002
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 6006
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 6008
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 6010
  $14 = $5 + 20 | 0; //@line 6011
  HEAP32[$14 >> 2] = $$014; //@line 6012
  HEAP32[$5 + 44 >> 2] = $$014; //@line 6014
  $16 = $$014 + $$$015 | 0; //@line 6015
  $17 = $5 + 16 | 0; //@line 6016
  HEAP32[$17 >> 2] = $16; //@line 6017
  HEAP32[$5 + 28 >> 2] = $16; //@line 6019
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 6020
  $19 = _vfprintf($5, $2, $3) | 0; //@line 6021
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 139; //@line 6024
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 6026
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 6028
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 6030
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 6032
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 6034
   sp = STACKTOP; //@line 6035
   STACKTOP = sp; //@line 6036
   return 0; //@line 6036
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6038
  if (!$$$015) {
   $$0 = $19; //@line 6041
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 6043
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 6048
   $$0 = $19; //@line 6049
  }
 }
 STACKTOP = sp; //@line 6052
 return $$0 | 0; //@line 6052
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 10531
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 10534
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 10537
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 10540
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 10546
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 10555
     $24 = $13 >>> 2; //@line 10556
     $$090 = 0; //@line 10557
     $$094 = $7; //@line 10557
     while (1) {
      $25 = $$094 >>> 1; //@line 10559
      $26 = $$090 + $25 | 0; //@line 10560
      $27 = $26 << 1; //@line 10561
      $28 = $27 + $23 | 0; //@line 10562
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 10565
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 10569
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 10575
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 10583
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 10587
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 10593
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 10598
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 10601
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 10601
      }
     }
     $46 = $27 + $24 | 0; //@line 10604
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 10607
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 10611
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 10623
     } else {
      $$4 = 0; //@line 10625
     }
    } else {
     $$4 = 0; //@line 10628
    }
   } else {
    $$4 = 0; //@line 10631
   }
  } else {
   $$4 = 0; //@line 10634
  }
 } while (0);
 return $$4 | 0; //@line 10637
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10196
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 10201
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 10206
  } else {
   $20 = $0 & 255; //@line 10208
   $21 = $0 & 255; //@line 10209
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 10215
   } else {
    $26 = $1 + 20 | 0; //@line 10217
    $27 = HEAP32[$26 >> 2] | 0; //@line 10218
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 10224
     HEAP8[$27 >> 0] = $20; //@line 10225
     $34 = $21; //@line 10226
    } else {
     label = 12; //@line 10228
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10233
     $32 = ___overflow($1, $0) | 0; //@line 10234
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 130; //@line 10237
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 10239
      sp = STACKTOP; //@line 10240
      return 0; //@line 10241
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 10243
      $34 = $32; //@line 10244
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 10249
   $$0 = $34; //@line 10250
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 10255
   $8 = $0 & 255; //@line 10256
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 10262
    $14 = HEAP32[$13 >> 2] | 0; //@line 10263
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 10269
     HEAP8[$14 >> 0] = $7; //@line 10270
     $$0 = $8; //@line 10271
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10275
   $19 = ___overflow($1, $0) | 0; //@line 10276
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 129; //@line 10279
    sp = STACKTOP; //@line 10280
    return 0; //@line 10281
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10283
    $$0 = $19; //@line 10284
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10289
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10904
 $1 = $0 + 20 | 0; //@line 10905
 $3 = $0 + 28 | 0; //@line 10907
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 10913
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10914
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 10915
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 136; //@line 10918
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 10920
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 10922
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10924
    sp = STACKTOP; //@line 10925
    return 0; //@line 10926
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10928
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 10932
     break;
    } else {
     label = 5; //@line 10935
     break;
    }
   }
  } else {
   label = 5; //@line 10940
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 10944
  $14 = HEAP32[$13 >> 2] | 0; //@line 10945
  $15 = $0 + 8 | 0; //@line 10946
  $16 = HEAP32[$15 >> 2] | 0; //@line 10947
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 10955
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 10956
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 10957
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 137; //@line 10960
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 10962
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 10964
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10966
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 10968
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 10970
     sp = STACKTOP; //@line 10971
     return 0; //@line 10972
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10974
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 10980
  HEAP32[$3 >> 2] = 0; //@line 10981
  HEAP32[$1 >> 2] = 0; //@line 10982
  HEAP32[$15 >> 2] = 0; //@line 10983
  HEAP32[$13 >> 2] = 0; //@line 10984
  $$0 = 0; //@line 10985
 }
 return $$0 | 0; //@line 10987
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6146
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 6151
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 6156
  } else {
   $20 = $0 & 255; //@line 6158
   $21 = $0 & 255; //@line 6159
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 6165
   } else {
    $26 = $1 + 20 | 0; //@line 6167
    $27 = HEAP32[$26 >> 2] | 0; //@line 6168
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 6174
     HEAP8[$27 >> 0] = $20; //@line 6175
     $34 = $21; //@line 6176
    } else {
     label = 12; //@line 6178
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6183
     $32 = ___overflow($1, $0) | 0; //@line 6184
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 144; //@line 6187
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6189
      sp = STACKTOP; //@line 6190
      return 0; //@line 6191
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6193
      $34 = $32; //@line 6194
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 6199
   $$0 = $34; //@line 6200
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 6205
   $8 = $0 & 255; //@line 6206
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 6212
    $14 = HEAP32[$13 >> 2] | 0; //@line 6213
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6219
     HEAP8[$14 >> 0] = $7; //@line 6220
     $$0 = $8; //@line 6221
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6225
   $19 = ___overflow($1, $0) | 0; //@line 6226
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 143; //@line 6229
    sp = STACKTOP; //@line 6230
    return 0; //@line 6231
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6233
    $$0 = $19; //@line 6234
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6239
}
function __ZN6Socket5closeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$pre = 0, $1 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $21 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1593
 $1 = $0 + 8 | 0; //@line 1594
 $2 = HEAP32[$1 >> 2] | 0; //@line 1595
 $$pre = $0 + 4 | 0; //@line 1597
 do {
  if (!$2) {
   $$0 = 0; //@line 1600
  } else {
   $4 = HEAP32[$$pre >> 2] | 0; //@line 1602
   $7 = HEAP32[(HEAP32[$4 >> 2] | 0) + 68 >> 2] | 0; //@line 1605
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1606
   FUNCTION_TABLE_viiii[$7 & 7]($4, $2, 0, 0); //@line 1607
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 66; //@line 1610
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1612
    HEAP32[$AsyncCtx + 8 >> 2] = $$pre; //@line 1614
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1616
    sp = STACKTOP; //@line 1617
    return 0; //@line 1618
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 1620
   $11 = HEAP32[$1 >> 2] | 0; //@line 1621
   HEAP32[$1 >> 2] = 0; //@line 1622
   $12 = HEAP32[$$pre >> 2] | 0; //@line 1623
   $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 32 >> 2] | 0; //@line 1626
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1627
   $16 = FUNCTION_TABLE_iii[$15 & 7]($12, $11) | 0; //@line 1628
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 67; //@line 1631
    HEAP32[$AsyncCtx2 + 4 >> 2] = $$pre; //@line 1633
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1635
    sp = STACKTOP; //@line 1636
    return 0; //@line 1637
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1639
    $$0 = $16; //@line 1640
    break;
   }
  }
 } while (0);
 HEAP32[$$pre >> 2] = 0; //@line 1645
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 1648
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1649
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 1650
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 68; //@line 1653
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$0; //@line 1655
  sp = STACKTOP; //@line 1656
  return 0; //@line 1657
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1659
  return $$0 | 0; //@line 1660
 }
 return 0; //@line 1662
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8587
 STACKTOP = STACKTOP + 32 | 0; //@line 8588
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8588
 $$byval_copy = sp; //@line 8589
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8591
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8593
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8595
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8597
 dest = $AsyncRetVal; //@line 8598
 stop = dest + 76 | 0; //@line 8598
 do {
  HEAP32[dest >> 2] = 0; //@line 8598
  dest = dest + 4 | 0; //@line 8598
 } while ((dest | 0) < (stop | 0));
 $8 = $AsyncRetVal + 12 | 0; //@line 8599
 HEAP32[$2 >> 2] = 0; //@line 8600
 HEAP32[$2 + 4 >> 2] = 0; //@line 8600
 HEAP32[$2 + 8 >> 2] = 0; //@line 8600
 HEAP32[$2 + 12 >> 2] = 0; //@line 8600
 HEAP32[$2 + 16 >> 2] = 0; //@line 8600
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 8601
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 8601
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 8601
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 8601
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8601
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 8602
 $9 = _emscripten_asm_const_ii(3, $4 | 0) | 0; //@line 8603
 if (($9 | 0) == -1) {
  HEAP32[___async_retval >> 2] = -3001; //@line 8607
  STACKTOP = sp; //@line 8608
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = $9; //@line 8610
 HEAP8[$AsyncRetVal + 8 >> 0] = 0; //@line 8612
 HEAP32[$AsyncRetVal + 4 >> 2] = $4; //@line 8614
 HEAP32[$6 >> 2] = $AsyncRetVal; //@line 8615
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8616
 _wait_ms(1); //@line 8617
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 8620
  sp = STACKTOP; //@line 8621
  STACKTOP = sp; //@line 8622
  return;
 }
 ___async_unwind = 0; //@line 8624
 HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 8625
 sp = STACKTOP; //@line 8626
 STACKTOP = sp; //@line 8627
 return;
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1407
 STACKTOP = STACKTOP + 32 | 0; //@line 1408
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1408
 $$byval_copy = sp; //@line 1409
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1411
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1413
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1415
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1417
 dest = $AsyncRetVal; //@line 1418
 stop = dest + 76 | 0; //@line 1418
 do {
  HEAP32[dest >> 2] = 0; //@line 1418
  dest = dest + 4 | 0; //@line 1418
 } while ((dest | 0) < (stop | 0));
 $8 = $AsyncRetVal + 12 | 0; //@line 1419
 HEAP32[$2 >> 2] = 0; //@line 1420
 HEAP32[$2 + 4 >> 2] = 0; //@line 1420
 HEAP32[$2 + 8 >> 2] = 0; //@line 1420
 HEAP32[$2 + 12 >> 2] = 0; //@line 1420
 HEAP32[$2 + 16 >> 2] = 0; //@line 1420
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 1421
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 1421
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 1421
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 1421
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1421
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 1422
 $9 = _emscripten_asm_const_ii(3, $4 | 0) | 0; //@line 1423
 if (($9 | 0) == -1) {
  HEAP32[___async_retval >> 2] = -3001; //@line 1427
  STACKTOP = sp; //@line 1428
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = $9; //@line 1430
 HEAP8[$AsyncRetVal + 8 >> 0] = 0; //@line 1432
 HEAP32[$AsyncRetVal + 4 >> 2] = $4; //@line 1434
 HEAP32[$6 >> 2] = $AsyncRetVal; //@line 1435
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1436
 _wait_ms(1); //@line 1437
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1440
  sp = STACKTOP; //@line 1441
  STACKTOP = sp; //@line 1442
  return;
 }
 ___async_unwind = 0; //@line 1444
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1445
 sp = STACKTOP; //@line 1446
 STACKTOP = sp; //@line 1447
 return;
}
function __ZNK13SocketAddresscvbEv($0) {
 $0 = $0 | 0;
 var $12 = 0;
 switch (HEAP32[$0 + 40 >> 2] | 0) {
 case 1:
  {
   if (HEAP8[$0 + 44 >> 0] | 0) {
    $12 = 1; //@line 2546
    return $12 | 0; //@line 2547
   }
   if (HEAP8[$0 + 45 >> 0] | 0) {
    $12 = 1; //@line 2553
    return $12 | 0; //@line 2554
   }
   if (!(HEAP8[$0 + 46 >> 0] | 0)) {
    return (HEAP8[$0 + 47 >> 0] | 0) != 0 | 0; //@line 2563
   } else {
    $12 = 1; //@line 2565
    return $12 | 0; //@line 2566
   }
   break;
  }
 case 2:
  {
   if (HEAP8[$0 + 44 >> 0] | 0) {
    $12 = 1; //@line 2575
    return $12 | 0; //@line 2576
   }
   if (HEAP8[$0 + 45 >> 0] | 0) {
    $12 = 1; //@line 2582
    return $12 | 0; //@line 2583
   }
   if (HEAP8[$0 + 46 >> 0] | 0) {
    $12 = 1; //@line 2589
    return $12 | 0; //@line 2590
   }
   if (HEAP8[$0 + 47 >> 0] | 0) {
    $12 = 1; //@line 2596
    return $12 | 0; //@line 2597
   }
   if (HEAP8[$0 + 48 >> 0] | 0) {
    $12 = 1; //@line 2603
    return $12 | 0; //@line 2604
   }
   if (HEAP8[$0 + 49 >> 0] | 0) {
    $12 = 1; //@line 2610
    return $12 | 0; //@line 2611
   }
   if (HEAP8[$0 + 50 >> 0] | 0) {
    $12 = 1; //@line 2617
    return $12 | 0; //@line 2618
   }
   if (HEAP8[$0 + 51 >> 0] | 0) {
    $12 = 1; //@line 2624
    return $12 | 0; //@line 2625
   }
   if (HEAP8[$0 + 52 >> 0] | 0) {
    $12 = 1; //@line 2631
    return $12 | 0; //@line 2632
   }
   if (HEAP8[$0 + 53 >> 0] | 0) {
    $12 = 1; //@line 2638
    return $12 | 0; //@line 2639
   }
   if (HEAP8[$0 + 54 >> 0] | 0) {
    $12 = 1; //@line 2645
    return $12 | 0; //@line 2646
   }
   if (HEAP8[$0 + 55 >> 0] | 0) {
    $12 = 1; //@line 2652
    return $12 | 0; //@line 2653
   }
   if (HEAP8[$0 + 56 >> 0] | 0) {
    $12 = 1; //@line 2659
    return $12 | 0; //@line 2660
   }
   if (HEAP8[$0 + 57 >> 0] | 0) {
    $12 = 1; //@line 2666
    return $12 | 0; //@line 2667
   }
   if (HEAP8[$0 + 58 >> 0] | 0) {
    $12 = 1; //@line 2673
    return $12 | 0; //@line 2674
   }
   $12 = (HEAP8[$0 + 59 >> 0] | 0) != 0; //@line 2679
   return $12 | 0; //@line 2680
  }
 default:
  {
   $12 = 0; //@line 2684
   return $12 | 0; //@line 2685
  }
 }
 return 0; //@line 2688
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9634
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9636
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9638
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9640
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9642
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9644
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9646
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9648
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9650
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9652
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9654
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9658
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9660
 HEAP32[$22 >> 2] = $AsyncRetVal | 0 ? $AsyncRetVal : 2545; //@line 9663
 _printf(2551, $22) | 0; //@line 9664
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 9665
 __ZN9UDPSocketC2I17EthernetInterfaceEEPT_($2, $4); //@line 9666
 if (!___async) {
  ___async_unwind = 0; //@line 9669
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 9671
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $16; //@line 9673
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $14; //@line 9675
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 9677
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 9679
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 9681
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 9683
 HEAP32[$ReallocAsyncCtx3 + 28 >> 2] = $8; //@line 9685
 HEAP32[$ReallocAsyncCtx3 + 32 >> 2] = $26; //@line 9687
 HEAP32[$ReallocAsyncCtx3 + 36 >> 2] = $10; //@line 9689
 HEAP32[$ReallocAsyncCtx3 + 40 >> 2] = $12; //@line 9691
 HEAP32[$ReallocAsyncCtx3 + 44 >> 2] = $14; //@line 9693
 HEAP32[$ReallocAsyncCtx3 + 48 >> 2] = $16; //@line 9695
 HEAP32[$ReallocAsyncCtx3 + 52 >> 2] = $18; //@line 9697
 HEAP32[$ReallocAsyncCtx3 + 56 >> 2] = $20; //@line 9699
 HEAP32[$ReallocAsyncCtx3 + 60 >> 2] = $2; //@line 9701
 sp = STACKTOP; //@line 9702
 return;
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9252
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9254
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9256
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9258
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9260
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9262
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9264
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9266
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9268
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9270
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9272
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9274
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9276
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9278
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9280
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9282
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 9283
 __ZN9UDPSocketC2I17EthernetInterfaceEEPT_($6, $10); //@line 9284
 if (!___async) {
  ___async_unwind = 0; //@line 9287
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 9289
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $2; //@line 9291
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 9293
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 9295
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 9297
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 9299
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 9301
 HEAP32[$ReallocAsyncCtx3 + 28 >> 2] = $14; //@line 9303
 HEAP32[$ReallocAsyncCtx3 + 32 >> 2] = $16; //@line 9305
 HEAP32[$ReallocAsyncCtx3 + 36 >> 2] = $18; //@line 9307
 HEAP32[$ReallocAsyncCtx3 + 40 >> 2] = $20; //@line 9309
 HEAP32[$ReallocAsyncCtx3 + 44 >> 2] = $22; //@line 9311
 HEAP32[$ReallocAsyncCtx3 + 48 >> 2] = $24; //@line 9313
 HEAP32[$ReallocAsyncCtx3 + 52 >> 2] = $26; //@line 9315
 HEAP32[$ReallocAsyncCtx3 + 56 >> 2] = $28; //@line 9317
 HEAP32[$ReallocAsyncCtx3 + 60 >> 2] = $30; //@line 9319
 sp = STACKTOP; //@line 9320
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 1761
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1763
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1765
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1767
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1769
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1771
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1773
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1777
  return;
 }
 $13 = $2 + 12 | 0; //@line 1780
 dest = $13; //@line 1781
 src = $4; //@line 1781
 stop = dest + 60 | 0; //@line 1781
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 1781
  dest = dest + 4 | 0; //@line 1781
  src = src + 4 | 0; //@line 1781
 } while ((dest | 0) < (stop | 0));
 HEAP16[$13 + 60 >> 1] = HEAP16[$4 + 60 >> 1] | 0; //@line 1781
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 1782
 _wait_ms(1); //@line 1783
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 1786
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1787
  HEAP32[$14 >> 2] = $6; //@line 1788
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1789
  HEAP32[$15 >> 2] = $2; //@line 1790
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1791
  HEAP32[$16 >> 2] = $8; //@line 1792
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1793
  HEAP32[$17 >> 2] = $10; //@line 1794
  sp = STACKTOP; //@line 1795
  return;
 }
 ___async_unwind = 0; //@line 1798
 HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 1799
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1800
 HEAP32[$14 >> 2] = $6; //@line 1801
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1802
 HEAP32[$15 >> 2] = $2; //@line 1803
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1804
 HEAP32[$16 >> 2] = $8; //@line 1805
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1806
 HEAP32[$17 >> 2] = $10; //@line 1807
 sp = STACKTOP; //@line 1808
 return;
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9556
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9558
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9560
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9562
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9564
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9566
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9568
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9570
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9572
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9574
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9576
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9578
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9580
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9582
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9584
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9586
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 9587
 __ZN9UDPSocketD2Ev($6); //@line 9588
 if (!___async) {
  ___async_unwind = 0; //@line 9591
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 9593
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $2; //@line 9595
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 9597
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 9599
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 9601
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $10; //@line 9603
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $12; //@line 9605
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $14; //@line 9607
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $16; //@line 9609
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $18; //@line 9611
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $20; //@line 9613
 HEAP32[$ReallocAsyncCtx6 + 44 >> 2] = $22; //@line 9615
 HEAP32[$ReallocAsyncCtx6 + 48 >> 2] = $24; //@line 9617
 HEAP32[$ReallocAsyncCtx6 + 52 >> 2] = $26; //@line 9619
 HEAP32[$ReallocAsyncCtx6 + 56 >> 2] = $28; //@line 9621
 HEAP32[$ReallocAsyncCtx6 + 60 >> 2] = $30; //@line 9623
 sp = STACKTOP; //@line 9624
 return;
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9480
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9482
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9484
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9486
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9488
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9490
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9492
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9494
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9496
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9498
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9500
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9502
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9504
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9506
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9508
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9510
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 9511
 __ZN9UDPSocketD2Ev($6); //@line 9512
 if (!___async) {
  ___async_unwind = 0; //@line 9515
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 9517
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $2; //@line 9519
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 9521
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 9523
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 9525
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $10; //@line 9527
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $12; //@line 9529
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $14; //@line 9531
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $16; //@line 9533
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $18; //@line 9535
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $20; //@line 9537
 HEAP32[$ReallocAsyncCtx6 + 44 >> 2] = $22; //@line 9539
 HEAP32[$ReallocAsyncCtx6 + 48 >> 2] = $24; //@line 9541
 HEAP32[$ReallocAsyncCtx6 + 52 >> 2] = $26; //@line 9543
 HEAP32[$ReallocAsyncCtx6 + 56 >> 2] = $28; //@line 9545
 HEAP32[$ReallocAsyncCtx6 + 60 >> 2] = $30; //@line 9547
 sp = STACKTOP; //@line 9548
 return;
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9404
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9406
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9408
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9410
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9412
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9414
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9416
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9418
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9420
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9422
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9424
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9426
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9428
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9430
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9432
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9434
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 9435
 __ZN9UDPSocketD2Ev($6); //@line 9436
 if (!___async) {
  ___async_unwind = 0; //@line 9439
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 9441
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $2; //@line 9443
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 9445
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 9447
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 9449
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $10; //@line 9451
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $12; //@line 9453
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $14; //@line 9455
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $16; //@line 9457
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $18; //@line 9459
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $20; //@line 9461
 HEAP32[$ReallocAsyncCtx6 + 44 >> 2] = $22; //@line 9463
 HEAP32[$ReallocAsyncCtx6 + 48 >> 2] = $24; //@line 9465
 HEAP32[$ReallocAsyncCtx6 + 52 >> 2] = $26; //@line 9467
 HEAP32[$ReallocAsyncCtx6 + 56 >> 2] = $28; //@line 9469
 HEAP32[$ReallocAsyncCtx6 + 60 >> 2] = $30; //@line 9471
 sp = STACKTOP; //@line 9472
 return;
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 10668
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 10674
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 10680
   } else {
    $7 = $1 & 255; //@line 10682
    $$03039 = $0; //@line 10683
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 10685
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 10690
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 10693
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 10698
      break;
     } else {
      $$03039 = $13; //@line 10701
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 10705
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 10706
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 10714
     $25 = $18; //@line 10714
     while (1) {
      $24 = $25 ^ $17; //@line 10716
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 10723
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 10726
      $25 = HEAP32[$31 >> 2] | 0; //@line 10727
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 10736
       break;
      } else {
       $$02936 = $31; //@line 10734
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 10741
    }
   } while (0);
   $38 = $1 & 255; //@line 10744
   $$1 = $$029$lcssa; //@line 10745
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 10747
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 10753
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 10756
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10761
}
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 9328
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9330
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9332
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9334
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9336
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9338
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9340
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9342
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9344
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9346
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9348
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9350
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9352
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9354
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9356
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 9358
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(64) | 0; //@line 9359
 _wait_ms(1e4); //@line 9360
 if (!___async) {
  ___async_unwind = 0; //@line 9363
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 125; //@line 9365
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $2; //@line 9367
 HEAP32[$ReallocAsyncCtx8 + 8 >> 2] = $4; //@line 9369
 HEAP32[$ReallocAsyncCtx8 + 12 >> 2] = $6; //@line 9371
 HEAP32[$ReallocAsyncCtx8 + 16 >> 2] = $8; //@line 9373
 HEAP32[$ReallocAsyncCtx8 + 20 >> 2] = $10; //@line 9375
 HEAP32[$ReallocAsyncCtx8 + 24 >> 2] = $12; //@line 9377
 HEAP32[$ReallocAsyncCtx8 + 28 >> 2] = $14; //@line 9379
 HEAP32[$ReallocAsyncCtx8 + 32 >> 2] = $16; //@line 9381
 HEAP32[$ReallocAsyncCtx8 + 36 >> 2] = $18; //@line 9383
 HEAP32[$ReallocAsyncCtx8 + 40 >> 2] = $20; //@line 9385
 HEAP32[$ReallocAsyncCtx8 + 44 >> 2] = $22; //@line 9387
 HEAP32[$ReallocAsyncCtx8 + 48 >> 2] = $24; //@line 9389
 HEAP32[$ReallocAsyncCtx8 + 52 >> 2] = $26; //@line 9391
 HEAP32[$ReallocAsyncCtx8 + 56 >> 2] = $28; //@line 9393
 HEAP32[$ReallocAsyncCtx8 + 60 >> 2] = $30; //@line 9395
 sp = STACKTOP; //@line 9396
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4687
 STACKTOP = STACKTOP + 144 | 0; //@line 4688
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 4688
 $1 = sp + 16 | 0; //@line 4689
 $2 = sp; //@line 4690
 HEAP32[$2 >> 2] = $varargs; //@line 4691
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4692
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 4693
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 4696
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 4698
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 4700
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 4702
  sp = STACKTOP; //@line 4703
  STACKTOP = sp; //@line 4704
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4706
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 4709
  return;
 }
 if (!(HEAP32[1484] | 0)) {
  _serial_init(5940, 2, 3); //@line 4714
  $$09$i = 0; //@line 4715
 } else {
  $$09$i = 0; //@line 4717
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 4722
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4723
  _serial_putc(5940, $12); //@line 4724
  if (___async) {
   label = 7; //@line 4727
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4730
  $18 = $$09$i + 1 | 0; //@line 4731
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 4734
   break;
  } else {
   $$09$i = $18; //@line 4737
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 110; //@line 4741
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 4743
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 4745
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 4747
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 4749
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 4751
  sp = STACKTOP; //@line 4752
  STACKTOP = sp; //@line 4753
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 4756
  return;
 }
}
function ___shgetc($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$phi$trans$insert = 0, $$phi$trans$insert29 = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $12 = 0, $14 = 0, $19 = 0, $2 = 0, $21 = 0, $26 = 0, $27 = 0, $29 = 0, $35 = 0, $36 = 0, $7 = 0, label = 0;
 $1 = $0 + 104 | 0; //@line 11994
 $2 = HEAP32[$1 >> 2] | 0; //@line 11995
 if (!$2) {
  label = 3; //@line 11998
 } else {
  if ((HEAP32[$0 + 108 >> 2] | 0) < ($2 | 0)) {
   label = 3; //@line 12004
  } else {
   label = 4; //@line 12006
  }
 }
 if ((label | 0) == 3) {
  $7 = ___uflow($0) | 0; //@line 12010
  if (($7 | 0) < 0) {
   label = 4; //@line 12013
  } else {
   $10 = HEAP32[$1 >> 2] | 0; //@line 12015
   $$phi$trans$insert = $0 + 8 | 0; //@line 12017
   if (!$10) {
    $$pre = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 12019
    $$sink = $$pre; //@line 12020
    $26 = $$pre; //@line 12020
   } else {
    $12 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 12022
    $14 = HEAP32[$0 + 4 >> 2] | 0; //@line 12024
    $19 = $10 - (HEAP32[$0 + 108 >> 2] | 0) | 0; //@line 12029
    $21 = $12; //@line 12031
    if (($12 - $14 | 0) < ($19 | 0)) {
     $$sink = $21; //@line 12033
     $26 = $21; //@line 12033
    } else {
     $$sink = $14 + ($19 + -1) | 0; //@line 12037
     $26 = $21; //@line 12037
    }
   }
   HEAP32[$0 + 100 >> 2] = $$sink; //@line 12041
   $$phi$trans$insert29 = $0 + 4 | 0; //@line 12043
   if (!$26) {
    $36 = HEAP32[$$phi$trans$insert29 >> 2] | 0; //@line 12046
   } else {
    $27 = HEAP32[$$phi$trans$insert29 >> 2] | 0; //@line 12048
    $29 = $0 + 108 | 0; //@line 12050
    HEAP32[$29 >> 2] = $26 + 1 - $27 + (HEAP32[$29 >> 2] | 0); //@line 12055
    $36 = $27; //@line 12057
   }
   $35 = $36 + -1 | 0; //@line 12059
   if (($7 | 0) == (HEAPU8[$35 >> 0] | 0 | 0)) {
    $$0 = $7; //@line 12064
   } else {
    HEAP8[$35 >> 0] = $7; //@line 12067
    $$0 = $7; //@line 12068
   }
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$0 + 100 >> 2] = 0; //@line 12074
  $$0 = -1; //@line 12075
 }
 return $$0 | 0; //@line 12077
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 10422
 $4 = HEAP32[$3 >> 2] | 0; //@line 10423
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 10430
   label = 5; //@line 10431
  } else {
   $$1 = 0; //@line 10433
  }
 } else {
  $12 = $4; //@line 10437
  label = 5; //@line 10438
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 10442
   $10 = HEAP32[$9 >> 2] | 0; //@line 10443
   $14 = $10; //@line 10446
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 10451
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 10459
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 10463
       $$141 = $0; //@line 10463
       $$143 = $1; //@line 10463
       $31 = $14; //@line 10463
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 10466
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 10473
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 10478
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 10481
      break L5;
     }
     $$139 = $$038; //@line 10487
     $$141 = $0 + $$038 | 0; //@line 10487
     $$143 = $1 - $$038 | 0; //@line 10487
     $31 = HEAP32[$9 >> 2] | 0; //@line 10487
    } else {
     $$139 = 0; //@line 10489
     $$141 = $0; //@line 10489
     $$143 = $1; //@line 10489
     $31 = $14; //@line 10489
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 10492
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 10495
   $$1 = $$139 + $$143 | 0; //@line 10497
  }
 } while (0);
 return $$1 | 0; //@line 10500
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2572
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2576
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2578
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2580
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2582
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2584
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2586
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2588
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 2591
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2592
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2608
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 2609
    if (!___async) {
     ___async_unwind = 0; //@line 2612
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 166; //@line 2614
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 2616
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2618
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2620
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2622
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2624
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 2626
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 2628
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 2630
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 2633
    sp = STACKTOP; //@line 2634
    return;
   }
  }
 } while (0);
 return;
}
function _strcspn($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01824 = 0, $$019$sink = 0, $$01922 = 0, $10 = 0, $12 = 0, $15 = 0, $19 = 0, $2 = 0, $25 = 0, $3 = 0, $34 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6310
 STACKTOP = STACKTOP + 32 | 0; //@line 6311
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6311
 $2 = sp; //@line 6312
 $3 = HEAP8[$1 >> 0] | 0; //@line 6313
 L1 : do {
  if (!($3 << 24 >> 24)) {
   label = 3; //@line 6317
  } else {
   if (!(HEAP8[$1 + 1 >> 0] | 0)) {
    label = 3; //@line 6323
   } else {
    _memset($2 | 0, 0, 32) | 0; //@line 6325
    $10 = HEAP8[$1 >> 0] | 0; //@line 6326
    if ($10 << 24 >> 24) {
     $$01824 = $1; //@line 6329
     $15 = $10; //@line 6329
     do {
      $19 = $2 + ((($15 & 255) >>> 5 & 255) << 2) | 0; //@line 6336
      HEAP32[$19 >> 2] = HEAP32[$19 >> 2] | 1 << ($15 & 31); //@line 6339
      $$01824 = $$01824 + 1 | 0; //@line 6340
      $15 = HEAP8[$$01824 >> 0] | 0; //@line 6341
     } while ($15 << 24 >> 24 != 0);
    }
    $12 = HEAP8[$0 >> 0] | 0; //@line 6350
    if (!($12 << 24 >> 24)) {
     $$019$sink = $0; //@line 6353
    } else {
     $$01922 = $0; //@line 6355
     $25 = $12; //@line 6355
     while (1) {
      if (HEAP32[$2 + ((($25 & 255) >>> 5 & 255) << 2) >> 2] & 1 << ($25 & 31) | 0) {
       $$019$sink = $$01922; //@line 6367
       break L1;
      }
      $34 = $$01922 + 1 | 0; //@line 6370
      $25 = HEAP8[$34 >> 0] | 0; //@line 6371
      if (!($25 << 24 >> 24)) {
       $$019$sink = $34; //@line 6374
       break;
      } else {
       $$01922 = $34; //@line 6377
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $$019$sink = ___strchrnul($0, $3 << 24 >> 24) | 0; //@line 6387
 }
 STACKTOP = sp; //@line 6392
 return $$019$sink - $0 | 0; //@line 6392
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10308
 STACKTOP = STACKTOP + 16 | 0; //@line 10309
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10309
 $2 = sp; //@line 10310
 $3 = $1 & 255; //@line 10311
 HEAP8[$2 >> 0] = $3; //@line 10312
 $4 = $0 + 16 | 0; //@line 10313
 $5 = HEAP32[$4 >> 2] | 0; //@line 10314
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 10321
   label = 4; //@line 10322
  } else {
   $$0 = -1; //@line 10324
  }
 } else {
  $12 = $5; //@line 10327
  label = 4; //@line 10328
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 10332
   $10 = HEAP32[$9 >> 2] | 0; //@line 10333
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 10336
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 10343
     HEAP8[$10 >> 0] = $3; //@line 10344
     $$0 = $13; //@line 10345
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 10350
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10351
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 10352
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 131; //@line 10355
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 10357
    sp = STACKTOP; //@line 10358
    STACKTOP = sp; //@line 10359
    return 0; //@line 10359
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 10361
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 10366
   } else {
    $$0 = -1; //@line 10368
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10372
 return $$0 | 0; //@line 10372
}
function _fflush__async_cb_82($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3981
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3983
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 3985
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 3989
  } else {
   $$02327 = $$02325; //@line 3991
   $$02426 = $AsyncRetVal; //@line 3991
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 3998
    } else {
     $16 = 0; //@line 4000
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 4012
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 4015
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 4018
     break L3;
    } else {
     $$02327 = $$023; //@line 4021
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 4024
   $13 = ___fflush_unlocked($$02327) | 0; //@line 4025
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 4029
    ___async_unwind = 0; //@line 4030
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 4032
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 4034
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 4036
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 4038
   sp = STACKTOP; //@line 4039
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 4043
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 4045
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 4665
 value = value & 255; //@line 4667
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 4670
   ptr = ptr + 1 | 0; //@line 4671
  }
  aligned_end = end & -4 | 0; //@line 4674
  block_aligned_end = aligned_end - 64 | 0; //@line 4675
  value4 = value | value << 8 | value << 16 | value << 24; //@line 4676
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 4679
   HEAP32[ptr + 4 >> 2] = value4; //@line 4680
   HEAP32[ptr + 8 >> 2] = value4; //@line 4681
   HEAP32[ptr + 12 >> 2] = value4; //@line 4682
   HEAP32[ptr + 16 >> 2] = value4; //@line 4683
   HEAP32[ptr + 20 >> 2] = value4; //@line 4684
   HEAP32[ptr + 24 >> 2] = value4; //@line 4685
   HEAP32[ptr + 28 >> 2] = value4; //@line 4686
   HEAP32[ptr + 32 >> 2] = value4; //@line 4687
   HEAP32[ptr + 36 >> 2] = value4; //@line 4688
   HEAP32[ptr + 40 >> 2] = value4; //@line 4689
   HEAP32[ptr + 44 >> 2] = value4; //@line 4690
   HEAP32[ptr + 48 >> 2] = value4; //@line 4691
   HEAP32[ptr + 52 >> 2] = value4; //@line 4692
   HEAP32[ptr + 56 >> 2] = value4; //@line 4693
   HEAP32[ptr + 60 >> 2] = value4; //@line 4694
   ptr = ptr + 64 | 0; //@line 4695
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 4699
   ptr = ptr + 4 | 0; //@line 4700
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 4705
  ptr = ptr + 1 | 0; //@line 4706
 }
 return end - num | 0; //@line 4708
}
function __ZN9UDPSocket8recvfromEP13SocketAddressPvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$2 = 0, $10 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3051
 $4 = $0 + 8 | 0; //@line 3052
 $5 = $0 + 52 | 0; //@line 3053
 $6 = $0 + 4 | 0; //@line 3054
 $7 = $0 + 12 | 0; //@line 3055
 while (1) {
  $8 = HEAP32[$4 >> 2] | 0; //@line 3057
  if (!$8) {
   $$2 = -3005; //@line 3060
   label = 6; //@line 3061
   break;
  }
  HEAP32[$5 >> 2] = 0; //@line 3064
  $10 = HEAP32[$6 >> 2] | 0; //@line 3065
  $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 64 >> 2] | 0; //@line 3068
  $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 3069
  $14 = FUNCTION_TABLE_iiiiii[$13 & 7]($10, $8, $1, $2, $3) | 0; //@line 3070
  if (___async) {
   label = 4; //@line 3073
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3076
  if (($14 | 0) != -3001 | (HEAP32[$7 >> 2] | 0) == 0) {
   $$2 = $14; //@line 3082
   label = 6; //@line 3083
   break;
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$AsyncCtx >> 2] = 77; //@line 3088
  HEAP32[$AsyncCtx + 4 >> 2] = $7; //@line 3090
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 3092
  HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3094
  HEAP32[$AsyncCtx + 16 >> 2] = $6; //@line 3096
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 3098
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 3100
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 3102
  sp = STACKTOP; //@line 3103
  return 0; //@line 3104
 } else if ((label | 0) == 6) {
  return $$2 | 0; //@line 3107
 }
 return 0; //@line 3109
}
function __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$2 = 0, $10 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2984
 $4 = $0 + 8 | 0; //@line 2985
 $5 = $0 + 52 | 0; //@line 2986
 $6 = $0 + 4 | 0; //@line 2987
 $7 = $0 + 12 | 0; //@line 2988
 while (1) {
  $8 = HEAP32[$4 >> 2] | 0; //@line 2990
  if (!$8) {
   $$2 = -3005; //@line 2993
   label = 6; //@line 2994
   break;
  }
  HEAP32[$5 >> 2] = 0; //@line 2997
  $10 = HEAP32[$6 >> 2] | 0; //@line 2998
  $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 60 >> 2] | 0; //@line 3001
  $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 3002
  $14 = FUNCTION_TABLE_iiiiii[$13 & 7]($10, $8, $1, $2, $3) | 0; //@line 3003
  if (___async) {
   label = 4; //@line 3006
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3009
  if (($14 | 0) != -3001 | (HEAP32[$7 >> 2] | 0) == 0) {
   $$2 = $14; //@line 3015
   label = 6; //@line 3016
   break;
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 3021
  HEAP32[$AsyncCtx + 4 >> 2] = $7; //@line 3023
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 3025
  HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3027
  HEAP32[$AsyncCtx + 16 >> 2] = $6; //@line 3029
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 3031
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 3033
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 3035
  sp = STACKTOP; //@line 3036
  return 0; //@line 3037
 } else if ((label | 0) == 6) {
  return $$2 | 0; //@line 3040
 }
 return 0; //@line 3042
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2509
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2513
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2515
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2517
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2519
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2521
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2523
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2526
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2527
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2536
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 2537
    if (!___async) {
     ___async_unwind = 0; //@line 2540
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 167; //@line 2542
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 2544
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2546
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2548
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2550
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2552
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2554
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2556
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 2559
    sp = STACKTOP; //@line 2560
    return;
   }
  }
 }
 return;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 8663
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8665
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8667
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8669
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8671
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8673
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8675
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8677
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8681
  return;
 }
 $15 = $2 + 12 | 0; //@line 8684
 dest = $15; //@line 8685
 src = $4; //@line 8685
 stop = dest + 60 | 0; //@line 8685
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 8685
  dest = dest + 4 | 0; //@line 8685
  src = src + 4 | 0; //@line 8685
 } while ((dest | 0) < (stop | 0));
 HEAP16[$15 + 60 >> 1] = HEAP16[$4 + 60 >> 1] | 0; //@line 8685
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(24) | 0; //@line 8686
 _wait_ms(1); //@line 8687
 if (!___async) {
  ___async_unwind = 0; //@line 8690
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 44; //@line 8692
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $6; //@line 8694
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $8; //@line 8696
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $2; //@line 8698
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $10; //@line 8700
 HEAP32[$ReallocAsyncCtx4 + 20 >> 2] = $12; //@line 8702
 sp = STACKTOP; //@line 8703
 return;
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $14 = 0, $5 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 897
 $5 = $0 + -4 | 0; //@line 898
 $8 = HEAP32[(HEAP32[$5 >> 2] | 0) + 92 >> 2] | 0; //@line 901
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 902
 $9 = FUNCTION_TABLE_iiiii[$8 & 15]($5, $1, $3, $4) | 0; //@line 903
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 906
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 908
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 910
  sp = STACKTOP; //@line 911
  return 0; //@line 912
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 914
 if (($2 | 0) != 0 & ($9 | 0) > -1) {
  $14 = $1 + 12 | 0; //@line 919
  dest = $2; //@line 920
  src = $14; //@line 920
  stop = dest + 60 | 0; //@line 920
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 920
   dest = dest + 4 | 0; //@line 920
   src = src + 4 | 0; //@line 920
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$14 + 60 >> 1] | 0; //@line 920
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 922
 _wait_ms(1); //@line 923
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 47; //@line 926
  HEAP32[$AsyncCtx2 + 4 >> 2] = $9; //@line 928
  sp = STACKTOP; //@line 929
  return 0; //@line 930
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 932
  return $9 | 0; //@line 933
 }
 return 0; //@line 935
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3882
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 3892
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 3892
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 3892
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 3896
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 3899
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 3902
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 3910
  } else {
   $20 = 0; //@line 3912
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 3922
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 3926
  HEAP32[___async_retval >> 2] = $$1; //@line 3928
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3931
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 3932
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 3936
  ___async_unwind = 0; //@line 3937
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 3939
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 3941
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 3943
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 3945
 sp = STACKTOP; //@line 3946
 return;
}
function __ZN9UDPSocketD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $15 = 0, $4 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2740
 HEAP32[$0 >> 2] = 440; //@line 2741
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2742
 __ZN6Socket5closeEv($0) | 0; //@line 2743
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 69; //@line 2746
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2748
  HEAP32[$AsyncCtx7 + 8 >> 2] = $0; //@line 2750
  sp = STACKTOP; //@line 2751
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2754
 HEAP32[$0 >> 2] = 404; //@line 2755
 $4 = HEAP32[$0 + 44 >> 2] | 0; //@line 2757
 do {
  if ($4 | 0) {
   $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2763
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2764
   FUNCTION_TABLE_vi[$8 & 255]($0 + 32 | 0); //@line 2765
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 70; //@line 2768
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2770
    sp = STACKTOP; //@line 2771
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2774
    break;
   }
  }
 } while (0);
 $11 = HEAP32[$0 + 28 >> 2] | 0; //@line 2780
 if (!$11) {
  return;
 }
 $15 = HEAP32[$11 + 8 >> 2] | 0; //@line 2787
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2788
 FUNCTION_TABLE_vi[$15 & 255]($0 + 16 | 0); //@line 2789
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 71; //@line 2792
  sp = STACKTOP; //@line 2793
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2796
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3347
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3349
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3351
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3353
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 3358
  } else {
   $9 = $4 + 4 | 0; //@line 3360
   $10 = HEAP32[$9 >> 2] | 0; //@line 3361
   $11 = $4 + 8 | 0; //@line 3362
   $12 = HEAP32[$11 >> 2] | 0; //@line 3363
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 3367
    HEAP32[$6 >> 2] = 0; //@line 3368
    HEAP32[$2 >> 2] = 0; //@line 3369
    HEAP32[$11 >> 2] = 0; //@line 3370
    HEAP32[$9 >> 2] = 0; //@line 3371
    $$0 = 0; //@line 3372
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 3379
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3380
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 3381
   if (!___async) {
    ___async_unwind = 0; //@line 3384
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 137; //@line 3386
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 3388
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3390
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 3392
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 3394
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 3396
   sp = STACKTOP; //@line 3397
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 3402
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 493
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 496
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 497
 $8 = FUNCTION_TABLE_iiiii[$7 & 15]($0, $1, $3, $4) | 0; //@line 498
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 501
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 503
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 505
  sp = STACKTOP; //@line 506
  return 0; //@line 507
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 509
 if (($2 | 0) != 0 & ($8 | 0) > -1) {
  $13 = $1 + 12 | 0; //@line 514
  dest = $2; //@line 515
  src = $13; //@line 515
  stop = dest + 60 | 0; //@line 515
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 515
   dest = dest + 4 | 0; //@line 515
   src = src + 4 | 0; //@line 515
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$13 + 60 >> 1] | 0; //@line 515
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 517
 _wait_ms(1); //@line 518
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 34; //@line 521
  HEAP32[$AsyncCtx3 + 4 >> 2] = $8; //@line 523
  sp = STACKTOP; //@line 524
  return 0; //@line 525
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 527
  return $8 | 0; //@line 528
 }
 return 0; //@line 530
}
function __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$byval_copy = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4326
 STACKTOP = STACKTOP + 48 | 0; //@line 4327
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4327
 $$byval_copy = sp + 20 | 0; //@line 4328
 $4 = sp; //@line 4329
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4330
 $5 = __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version($0, $1, $4, 1, $3) | 0; //@line 4331
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 4334
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 4336
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 4338
  HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 4340
  sp = STACKTOP; //@line 4341
  STACKTOP = sp; //@line 4342
  return 0; //@line 4342
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4344
  HEAP32[$$byval_copy >> 2] = HEAP32[$4 >> 2]; //@line 4345
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$4 + 4 >> 2]; //@line 4345
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$4 + 8 >> 2]; //@line 4345
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$4 + 12 >> 2]; //@line 4345
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$4 + 16 >> 2]; //@line 4345
  __ZN13SocketAddress8set_addrE10nsapi_addr($2, $$byval_copy); //@line 4346
  STACKTOP = sp; //@line 4349
  return (($5 | 0) < 0 ? $5 : 0) | 0; //@line 4349
 }
 return 0; //@line 4351
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 5751
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 5756
    $$0 = 1; //@line 5757
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 5770
     $$0 = 1; //@line 5771
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 5775
     $$0 = -1; //@line 5776
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 5786
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 5790
    $$0 = 2; //@line 5791
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 5803
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 5809
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 5813
    $$0 = 3; //@line 5814
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 5824
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 5830
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 5836
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 5840
    $$0 = 4; //@line 5841
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 5845
    $$0 = -1; //@line 5846
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5851
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_73($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3298
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3300
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3302
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3304
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3306
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 3311
  return;
 }
 dest = $2 + 4 | 0; //@line 3315
 stop = dest + 52 | 0; //@line 3315
 do {
  HEAP32[dest >> 2] = 0; //@line 3315
  dest = dest + 4 | 0; //@line 3315
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 3316
 HEAP32[$2 + 8 >> 2] = $4; //@line 3318
 HEAP32[$2 + 12 >> 2] = -1; //@line 3320
 HEAP32[$2 + 48 >> 2] = 1; //@line 3322
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 3325
 $16 = HEAP32[$6 >> 2] | 0; //@line 3326
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3327
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 3328
 if (!___async) {
  ___async_unwind = 0; //@line 3331
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 152; //@line 3333
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3335
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 3337
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 3339
 sp = STACKTOP; //@line 3340
 return;
}
function __ZN9UDPSocketD2Ev__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1685
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1689
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 404; //@line 1690
 $6 = HEAP32[$4 + 44 >> 2] | 0; //@line 1692
 if ($6 | 0) {
  $10 = HEAP32[$6 + 8 >> 2] | 0; //@line 1697
  $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 1698
  FUNCTION_TABLE_vi[$10 & 255]($4 + 32 | 0); //@line 1699
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 1702
   $11 = $ReallocAsyncCtx + 4 | 0; //@line 1703
   HEAP32[$11 >> 2] = $4; //@line 1704
   sp = STACKTOP; //@line 1705
   return;
  }
  ___async_unwind = 0; //@line 1708
  HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 1709
  $11 = $ReallocAsyncCtx + 4 | 0; //@line 1710
  HEAP32[$11 >> 2] = $4; //@line 1711
  sp = STACKTOP; //@line 1712
  return;
 }
 $13 = HEAP32[$4 + 28 >> 2] | 0; //@line 1716
 if (!$13) {
  return;
 }
 $17 = HEAP32[$13 + 8 >> 2] | 0; //@line 1723
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1724
 FUNCTION_TABLE_vi[$17 & 255]($4 + 16 | 0); //@line 1725
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 1728
  sp = STACKTOP; //@line 1729
  return;
 }
 ___async_unwind = 0; //@line 1732
 HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 1733
 sp = STACKTOP; //@line 1734
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2645
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2649
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2651
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2653
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2655
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2657
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 2660
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2661
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2667
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 2668
   if (!___async) {
    ___async_unwind = 0; //@line 2671
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 165; //@line 2673
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 2675
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2677
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 2679
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2681
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 2683
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 2685
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 2688
   sp = STACKTOP; //@line 2689
   return;
  }
 }
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 4635
  $8 = $0; //@line 4635
  $9 = $1; //@line 4635
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 4637
   $$0914 = $$0914 + -1 | 0; //@line 4641
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 4642
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 4643
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 4651
   }
  }
  $$010$lcssa$off0 = $8; //@line 4656
  $$09$lcssa = $$0914; //@line 4656
 } else {
  $$010$lcssa$off0 = $0; //@line 4658
  $$09$lcssa = $2; //@line 4658
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 4662
 } else {
  $$012 = $$010$lcssa$off0; //@line 4664
  $$111 = $$09$lcssa; //@line 4664
  while (1) {
   $26 = $$111 + -1 | 0; //@line 4669
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 4670
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 4674
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 4677
    $$111 = $26; //@line 4677
   }
  }
 }
 return $$1$lcssa | 0; //@line 4681
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 10074
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 10079
   label = 4; //@line 10080
  } else {
   $$01519 = $0; //@line 10082
   $23 = $1; //@line 10082
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 10087
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 10090
    $23 = $6; //@line 10091
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 10095
     label = 4; //@line 10096
     break;
    } else {
     $$01519 = $6; //@line 10099
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 10105
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 10107
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 10115
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 10123
  } else {
   $$pn = $$0; //@line 10125
   while (1) {
    $19 = $$pn + 1 | 0; //@line 10127
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 10131
     break;
    } else {
     $$pn = $19; //@line 10134
    }
   }
  }
  $$sink = $$1$lcssa; //@line 10139
 }
 return $$sink - $1 | 0; //@line 10142
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8437
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8439
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8443
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8445
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8447
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8449
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 8453
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 8456
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 8457
   if (!___async) {
    ___async_unwind = 0; //@line 8460
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 169; //@line 8462
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8464
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 8466
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8468
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 8470
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8472
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 8474
   sp = STACKTOP; //@line 8475
   return;
  }
 }
 return;
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 1460
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1462
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1466
 if (($2 | 0) != 0 & ($AsyncRetVal | 0) > -1) {
  $8 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 1471
  dest = $2; //@line 1472
  src = $8; //@line 1472
  stop = dest + 60 | 0; //@line 1472
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 1472
   dest = dest + 4 | 0; //@line 1472
   src = src + 4 | 0; //@line 1472
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$8 + 60 >> 1] | 0; //@line 1472
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1474
 _wait_ms(1); //@line 1475
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 1478
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1479
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 1480
  sp = STACKTOP; //@line 1481
  return;
 }
 ___async_unwind = 0; //@line 1484
 HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 1485
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1486
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 1487
 sp = STACKTOP; //@line 1488
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 6883
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 6890
   $10 = $1 + 16 | 0; //@line 6891
   $11 = HEAP32[$10 >> 2] | 0; //@line 6892
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 6895
    HEAP32[$1 + 24 >> 2] = $4; //@line 6897
    HEAP32[$1 + 36 >> 2] = 1; //@line 6899
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 6909
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 6914
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 6917
    HEAP8[$1 + 54 >> 0] = 1; //@line 6919
    break;
   }
   $21 = $1 + 24 | 0; //@line 6922
   $22 = HEAP32[$21 >> 2] | 0; //@line 6923
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 6926
    $28 = $4; //@line 6927
   } else {
    $28 = $22; //@line 6929
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 6938
   }
  }
 } while (0);
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 4167
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4169
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4173
 if (($2 | 0) != 0 & ($AsyncRetVal | 0) > -1) {
  $8 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 4178
  dest = $2; //@line 4179
  src = $8; //@line 4179
  stop = dest + 60 | 0; //@line 4179
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 4179
   dest = dest + 4 | 0; //@line 4179
   src = src + 4 | 0; //@line 4179
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$8 + 60 >> 1] | 0; //@line 4179
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4181
 _wait_ms(1); //@line 4182
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 34; //@line 4185
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 4186
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 4187
  sp = STACKTOP; //@line 4188
  return;
 }
 ___async_unwind = 0; //@line 4191
 HEAP32[$ReallocAsyncCtx2 >> 2] = 34; //@line 4192
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 4193
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 4194
 sp = STACKTOP; //@line 4195
 return;
}
function __ZN6Socket5closeEv__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3442
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3444
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3446
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3448
 $7 = HEAP32[$2 >> 2] | 0; //@line 3449
 HEAP32[$2 >> 2] = 0; //@line 3450
 $8 = HEAP32[$4 >> 2] | 0; //@line 3451
 $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 32 >> 2] | 0; //@line 3454
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 3455
 $12 = FUNCTION_TABLE_iii[$11 & 7]($8, $7) | 0; //@line 3456
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3459
  $13 = $ReallocAsyncCtx2 + 4 | 0; //@line 3460
  HEAP32[$13 >> 2] = $4; //@line 3461
  $14 = $ReallocAsyncCtx2 + 8 | 0; //@line 3462
  HEAP32[$14 >> 2] = $6; //@line 3463
  sp = STACKTOP; //@line 3464
  return;
 }
 HEAP32[___async_retval >> 2] = $12; //@line 3468
 ___async_unwind = 0; //@line 3469
 HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3470
 $13 = $ReallocAsyncCtx2 + 4 | 0; //@line 3471
 HEAP32[$13 >> 2] = $4; //@line 3472
 $14 = $ReallocAsyncCtx2 + 8 | 0; //@line 3473
 HEAP32[$14 >> 2] = $6; //@line 3474
 sp = STACKTOP; //@line 3475
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6245
 $1 = HEAP32[171] | 0; //@line 6246
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 6252
 } else {
  $19 = 0; //@line 6254
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 6260
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 6266
    $12 = HEAP32[$11 >> 2] | 0; //@line 6267
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 6273
     HEAP8[$12 >> 0] = 10; //@line 6274
     $22 = 0; //@line 6275
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 6279
   $17 = ___overflow($1, 10) | 0; //@line 6280
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 145; //@line 6283
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 6285
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 6287
    sp = STACKTOP; //@line 6288
    return 0; //@line 6289
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6291
    $22 = $17 >> 31; //@line 6293
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 6300
 }
 return $22 | 0; //@line 6302
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8485
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8491
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8493
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8495
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8497
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 8502
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 8504
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 8505
 if (!___async) {
  ___async_unwind = 0; //@line 8508
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 169; //@line 8510
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 8512
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 8514
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 8516
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 8518
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 8520
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 8522
 sp = STACKTOP; //@line 8523
 return;
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 978
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 60 >> 2] | 0; //@line 981
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 982
 $7 = FUNCTION_TABLE_ii[$6 & 15]($0) | 0; //@line 983
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 986
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 988
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 990
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 992
  sp = STACKTOP; //@line 993
  return 0; //@line 994
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 996
 $13 = HEAP32[(HEAP32[$7 >> 2] | 0) + 12 >> 2] | 0; //@line 999
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1000
 $14 = FUNCTION_TABLE_iiiii[$13 & 15]($7, $1, $2, $3) | 0; //@line 1001
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 49; //@line 1004
  sp = STACKTOP; //@line 1005
  return 0; //@line 1006
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1008
  return $14 | 0; //@line 1009
 }
 return 0; //@line 1011
}
function __ZN6Socket4openEP12NetworkStack__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 950
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 952
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 954
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 956
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 958
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 960
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 962
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 964
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 966
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 967
 $16 = FUNCTION_TABLE_iiii[$10 & 15]($8, $2, $AsyncRetVal) | 0; //@line 968
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 972
  ___async_unwind = 0; //@line 973
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 975
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 977
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 979
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 981
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $12; //@line 983
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $14; //@line 985
 sp = STACKTOP; //@line 986
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3772
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3774
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3776
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3778
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 3780
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 3782
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5491; //@line 3787
  HEAP32[$4 + 4 >> 2] = $6; //@line 3789
  _abort_message(5400, $4); //@line 3790
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 3793
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 3796
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3797
 $16 = FUNCTION_TABLE_ii[$15 & 15]($12) | 0; //@line 3798
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 3802
  ___async_unwind = 0; //@line 3803
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 148; //@line 3805
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 3807
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3809
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 3811
 sp = STACKTOP; //@line 3812
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $19 = 0;
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 6742
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 6751
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 6756
      HEAP32[$13 >> 2] = $2; //@line 6757
      $19 = $1 + 40 | 0; //@line 6758
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 6761
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 6771
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 6775
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 6782
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8324
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8326
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8328
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8332
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8336
  label = 4; //@line 8337
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8342
   label = 4; //@line 8343
  } else {
   $$037$off039 = 3; //@line 8345
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8349
  $17 = $8 + 40 | 0; //@line 8350
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8353
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8363
    $$037$off039 = $$037$off038; //@line 8364
   } else {
    $$037$off039 = $$037$off038; //@line 8366
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8369
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8372
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 5871
 while (1) {
  if ((HEAPU8[3463 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 5878
   break;
  }
  $7 = $$016 + 1 | 0; //@line 5881
  if (($7 | 0) == 87) {
   $$01214 = 3551; //@line 5884
   $$115 = 87; //@line 5884
   label = 5; //@line 5885
   break;
  } else {
   $$016 = $7; //@line 5888
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3551; //@line 5894
  } else {
   $$01214 = 3551; //@line 5896
   $$115 = $$016; //@line 5896
   label = 5; //@line 5897
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 5902
   $$113 = $$01214; //@line 5903
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 5907
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 5914
   if (!$$115) {
    $$012$lcssa = $$113; //@line 5917
    break;
   } else {
    $$01214 = $$113; //@line 5920
    label = 5; //@line 5921
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 5928
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1501
 $1 = $0 + 12 | 0; //@line 1502
 $2 = HEAP32[$1 >> 2] | 0; //@line 1503
 do {
  if (!$2) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1507
   _mbed_assert_internal(2417, 2422, 528); //@line 1508
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 63; //@line 1511
    HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1513
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1515
    sp = STACKTOP; //@line 1516
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1519
    $7 = HEAP32[$1 >> 2] | 0; //@line 1521
    break;
   }
  } else {
   $7 = $2; //@line 1525
  }
 } while (0);
 $6 = HEAP32[$7 >> 2] | 0; //@line 1528
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1529
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1530
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 1533
  sp = STACKTOP; //@line 1534
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1537
  return;
 }
}
function __ZN6SocketD2Ev($0) {
 $0 = $0 | 0;
 var $13 = 0, $2 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1224
 HEAP32[$0 >> 2] = 404; //@line 1225
 $2 = HEAP32[$0 + 44 >> 2] | 0; //@line 1227
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 1233
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1234
   FUNCTION_TABLE_vi[$6 & 255]($0 + 32 | 0); //@line 1235
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 54; //@line 1238
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1240
    sp = STACKTOP; //@line 1241
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1244
    break;
   }
  }
 } while (0);
 $9 = HEAP32[$0 + 28 >> 2] | 0; //@line 1250
 if (!$9) {
  return;
 }
 $13 = HEAP32[$9 + 8 >> 2] | 0; //@line 1257
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1258
 FUNCTION_TABLE_vi[$13 & 255]($0 + 16 | 0); //@line 1259
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 55; //@line 1262
  sp = STACKTOP; //@line 1263
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1266
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4837
 $2 = $0 + 12 | 0; //@line 4839
 $3 = HEAP32[$2 >> 2] | 0; //@line 4840
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4844
   _mbed_assert_internal(2417, 2422, 528); //@line 4845
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 113; //@line 4848
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 4850
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 4852
    sp = STACKTOP; //@line 4853
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4856
    $8 = HEAP32[$2 >> 2] | 0; //@line 4858
    break;
   }
  } else {
   $8 = $3; //@line 4862
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 4865
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4867
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 4868
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 114; //@line 4871
  sp = STACKTOP; //@line 4872
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4875
  return;
 }
}
function __ZN9UDPSocketC2I17EthernetInterfaceEEPT_($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $5 = 0, $6 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5390
 __ZN6SocketC2Ev($0); //@line 5391
 HEAP32[$0 >> 2] = 440; //@line 5392
 HEAP32[$0 + 52 >> 2] = 0; //@line 5394
 $5 = HEAP32[(HEAP32[$1 >> 2] | 0) + 60 >> 2] | 0; //@line 5397
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5398
 $6 = FUNCTION_TABLE_ii[$5 & 15]($1) | 0; //@line 5399
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 5402
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 5404
  sp = STACKTOP; //@line 5405
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 5408
 $8 = __Z18nsapi_create_stackP12NetworkStack($6) | 0; //@line 5409
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5410
 __ZN6Socket4openEP12NetworkStack($0, $8) | 0; //@line 5411
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 128; //@line 5414
  sp = STACKTOP; //@line 5415
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 5418
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6575
 STACKTOP = STACKTOP + 16 | 0; //@line 6576
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6576
 $1 = sp; //@line 6577
 HEAP32[$1 >> 2] = $varargs; //@line 6578
 $2 = HEAP32[139] | 0; //@line 6579
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6580
 _vfprintf($2, $0, $1) | 0; //@line 6581
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 149; //@line 6584
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6586
  sp = STACKTOP; //@line 6587
  STACKTOP = sp; //@line 6588
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 6590
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6591
 _fputc(10, $2) | 0; //@line 6592
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 150; //@line 6595
  sp = STACKTOP; //@line 6596
  STACKTOP = sp; //@line 6597
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 6599
  _abort(); //@line 6600
 }
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9739
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9741
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9743
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9745
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9747
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1484] | 0)) {
  _serial_init(5940, 2, 3); //@line 9755
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 9758
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9759
 _serial_putc(5940, $12); //@line 9760
 if (!___async) {
  ___async_unwind = 0; //@line 9763
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 9765
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 9767
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 9769
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 9771
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 9773
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 9775
 sp = STACKTOP; //@line 9776
 return;
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1863
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1865
 $6 = HEAP32[$0 + 16 >> 2] | 0; //@line 1869
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 1871
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 1873
 if (__ZN13SocketAddress14set_ip_addressEPKc($2, HEAP32[___async_retval >> 2] | 0) | 0) {
  $$0 = __ZNK13SocketAddress14get_ip_versionEv($2) | 0; //@line 1879
 } else {
  $$0 = 0; //@line 1881
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1883
 $14 = __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($6, $8, $10, $$0) | 0; //@line 1884
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 53; //@line 1887
  sp = STACKTOP; //@line 1888
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 1892
 ___async_unwind = 0; //@line 1893
 HEAP32[$ReallocAsyncCtx2 >> 2] = 53; //@line 1894
 sp = STACKTOP; //@line 1895
 return;
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1017
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 60 >> 2] | 0; //@line 1020
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1021
 $5 = FUNCTION_TABLE_ii[$4 & 15]($0) | 0; //@line 1022
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 50; //@line 1025
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1027
  sp = STACKTOP; //@line 1028
  return 0; //@line 1029
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1031
 $9 = HEAP32[(HEAP32[$5 >> 2] | 0) + 16 >> 2] | 0; //@line 1034
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1035
 $10 = FUNCTION_TABLE_iii[$9 & 7]($5, $1) | 0; //@line 1036
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 51; //@line 1039
  sp = STACKTOP; //@line 1040
  return 0; //@line 1041
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1043
  return $10 | 0; //@line 1044
 }
 return 0; //@line 1046
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 5702
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 5702
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 5703
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 5704
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 5713
    $$016 = $9; //@line 5716
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 5716
   } else {
    $$016 = $0; //@line 5718
    $storemerge = 0; //@line 5718
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 5720
   $$0 = $$016; //@line 5721
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 5725
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 5731
   HEAP32[tempDoublePtr >> 2] = $2; //@line 5734
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 5734
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 5735
  }
 }
 return +$$0;
}
function _scalbn($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$020 = 0, $10 = 0.0, $12 = 0, $14 = 0, $17 = 0, $18 = 0, $3 = 0.0, $5 = 0, $7 = 0;
 if (($1 | 0) > 1023) {
  $3 = $0 * 8.98846567431158e+307; //@line 2619
  $5 = ($1 | 0) > 2046; //@line 2621
  $7 = $1 + -2046 | 0; //@line 2623
  $$0 = $5 ? $3 * 8.98846567431158e+307 : $3; //@line 2628
  $$020 = $5 ? ($7 | 0) < 1023 ? $7 : 1023 : $1 + -1023 | 0; //@line 2628
 } else {
  if (($1 | 0) < -1022) {
   $10 = $0 * 2.2250738585072014e-308; //@line 2632
   $12 = ($1 | 0) < -2044; //@line 2634
   $14 = $1 + 2044 | 0; //@line 2636
   $$0 = $12 ? $10 * 2.2250738585072014e-308 : $10; //@line 2641
   $$020 = $12 ? ($14 | 0) > -1022 ? $14 : -1022 : $1 + 1022 | 0; //@line 2641
  } else {
   $$0 = $0; //@line 2643
   $$020 = $1; //@line 2643
  }
 }
 $17 = _bitshift64Shl($$020 + 1023 | 0, 0, 52) | 0; //@line 2647
 $18 = tempRet0; //@line 2648
 HEAP32[tempDoublePtr >> 2] = $17; //@line 2649
 HEAP32[tempDoublePtr + 4 >> 2] = $18; //@line 2649
 return +($$0 * +HEAPF64[tempDoublePtr >> 3]);
}
function _mbed_error_printf__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9783
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9787
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9789
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9791
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9793
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 9794
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 9801
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9802
 _serial_putc(5940, $14); //@line 9803
 if (!___async) {
  ___async_unwind = 0; //@line 9806
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 9808
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 9810
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 9812
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 9814
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 9816
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 9818
 sp = STACKTOP; //@line 9819
 return;
}
function __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, sp = 0;
 sp = STACKTOP; //@line 8640
 STACKTOP = STACKTOP + 32 | 0; //@line 8641
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8641
 $$byval_copy = sp; //@line 8642
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8644
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8646
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8650
 HEAP32[$$byval_copy >> 2] = HEAP32[$4 >> 2]; //@line 8651
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$4 + 4 >> 2]; //@line 8651
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$4 + 8 >> 2]; //@line 8651
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$4 + 12 >> 2]; //@line 8651
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$4 + 16 >> 2]; //@line 8651
 __ZN13SocketAddress8set_addrE10nsapi_addr($2, $$byval_copy); //@line 8652
 HEAP32[___async_retval >> 2] = ($AsyncRetVal | 0) < 0 ? $AsyncRetVal : 0; //@line 8656
 STACKTOP = sp; //@line 8657
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8187
 STACKTOP = STACKTOP + 16 | 0; //@line 8188
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8188
 $3 = sp; //@line 8189
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8191
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 8194
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8195
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 8196
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 173; //@line 8199
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8201
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8203
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8205
  sp = STACKTOP; //@line 8206
  STACKTOP = sp; //@line 8207
  return 0; //@line 8207
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8209
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 8213
 }
 STACKTOP = sp; //@line 8215
 return $8 & 1 | 0; //@line 8215
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1508
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1516
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1518
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1520
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1522
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1524
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1526
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1528
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1539
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1540
 HEAP32[$10 >> 2] = 0; //@line 1541
 HEAP32[$12 >> 2] = 0; //@line 1542
 HEAP32[$14 >> 2] = 0; //@line 1543
 HEAP32[$2 >> 2] = 0; //@line 1544
 $33 = HEAP32[$16 >> 2] | 0; //@line 1545
 HEAP32[$16 >> 2] = $33 | $18; //@line 1550
 if ($20 | 0) {
  ___unlockfile($22); //@line 1553
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1556
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7098
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7104
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 7107
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7110
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7111
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 7112
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 155; //@line 7115
    sp = STACKTOP; //@line 7116
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7119
    break;
   }
  }
 } while (0);
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_42($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1325
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1333
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1335
 $11 = HEAP32[HEAP32[$0 + 8 >> 2] >> 2] | 0; //@line 1336
 $14 = HEAP32[(HEAP32[$11 >> 2] | 0) + 68 >> 2] | 0; //@line 1339
 $15 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 1340
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 1341
 FUNCTION_TABLE_viiii[$14 & 7]($11, $15, 61, $8); //@line 1342
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1345
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 1346
  HEAP32[$16 >> 2] = $10; //@line 1347
  sp = STACKTOP; //@line 1348
  return;
 }
 ___async_unwind = 0; //@line 1351
 HEAP32[$ReallocAsyncCtx6 >> 2] = 62; //@line 1352
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 1353
 HEAP32[$16 >> 2] = $10; //@line 1354
 sp = STACKTOP; //@line 1355
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $17 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8097
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 8099
 $8 = $7 >> 8; //@line 8100
 if (!($7 & 1)) {
  $$0 = $8; //@line 8104
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 8109
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 8111
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 8114
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8119
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 8120
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 171; //@line 8123
  sp = STACKTOP; //@line 8124
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8127
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7267
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7273
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 7276
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 7279
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7280
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 7281
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 158; //@line 7284
    sp = STACKTOP; //@line 7285
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7288
    break;
   }
  }
 } while (0);
 return;
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6397
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 6399
 while (1) {
  $2 = _malloc($$) | 0; //@line 6401
  if ($2 | 0) {
   $$lcssa = $2; //@line 6404
   label = 7; //@line 6405
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 6408
  if (!$4) {
   $$lcssa = 0; //@line 6411
   label = 7; //@line 6412
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6415
  FUNCTION_TABLE_v[$4 & 3](); //@line 6416
  if (___async) {
   label = 5; //@line 6419
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6422
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 6425
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 6427
  sp = STACKTOP; //@line 6428
  return 0; //@line 6429
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 6432
 }
 return 0; //@line 6434
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8261
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8263
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8265
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8267
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8269
 $10 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 12 >> 2] | 0; //@line 8272
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8273
 $11 = FUNCTION_TABLE_iiiii[$10 & 15]($AsyncRetVal, $2, $4, $6) | 0; //@line 8274
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 8277
  sp = STACKTOP; //@line 8278
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 8282
 ___async_unwind = 0; //@line 8283
 HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 8284
 sp = STACKTOP; //@line 8285
 return;
}
function ___dynamic_cast__async_cb_83($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4076
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4078
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4080
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4086
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 4101
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 4117
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 4122
    break;
   }
  default:
   {
    $$0 = 0; //@line 4126
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4131
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8139
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 8141
 $7 = $6 >> 8; //@line 8142
 if (!($6 & 1)) {
  $$0 = $7; //@line 8146
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 8151
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 8153
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 8156
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8161
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 8162
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 172; //@line 8165
  sp = STACKTOP; //@line 8166
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8169
  return;
 }
}
function __ZN6Socket5closeEv__async_cb_75($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3481
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3485
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3487
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 0; //@line 3488
 $8 = HEAP32[(HEAP32[$4 >> 2] | 0) + 12 >> 2] | 0; //@line 3491
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3492
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 3493
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 3496
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 3497
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 3498
  sp = STACKTOP; //@line 3499
  return;
 }
 ___async_unwind = 0; //@line 3502
 HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 3503
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 3504
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 3505
 sp = STACKTOP; //@line 3506
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8054
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 8056
 $6 = $5 >> 8; //@line 8057
 if (!($5 & 1)) {
  $$0 = $6; //@line 8061
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 8066
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 8068
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 8071
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8076
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 8077
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 170; //@line 8080
  sp = STACKTOP; //@line 8081
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8084
  return;
 }
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8727
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8731
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8733
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8735
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8737
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 8740
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8741
 $14 = FUNCTION_TABLE_iiiii[$13 & 15]($4, $6, $8, $10) | 0; //@line 8742
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 8745
  sp = STACKTOP; //@line 8746
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 8750
 ___async_unwind = 0; //@line 8751
 HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 8752
 sp = STACKTOP; //@line 8753
 return;
}
function ___toread($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $15 = 0, $23 = 0, $3 = 0, $7 = 0, $9 = 0;
 $1 = $0 + 74 | 0; //@line 2993
 $3 = HEAP8[$1 >> 0] | 0; //@line 2995
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 2999
 $7 = $0 + 20 | 0; //@line 3000
 $9 = $0 + 28 | 0; //@line 3002
 if ((HEAP32[$7 >> 2] | 0) >>> 0 > (HEAP32[$9 >> 2] | 0) >>> 0) {
  FUNCTION_TABLE_iiii[HEAP32[$0 + 36 >> 2] & 15]($0, 0, 0) | 0; //@line 3008
 }
 HEAP32[$0 + 16 >> 2] = 0; //@line 3011
 HEAP32[$9 >> 2] = 0; //@line 3012
 HEAP32[$7 >> 2] = 0; //@line 3013
 $15 = HEAP32[$0 >> 2] | 0; //@line 3014
 if (!($15 & 4)) {
  $23 = (HEAP32[$0 + 44 >> 2] | 0) + (HEAP32[$0 + 48 >> 2] | 0) | 0; //@line 3022
  HEAP32[$0 + 8 >> 2] = $23; //@line 3024
  HEAP32[$0 + 4 >> 2] = $23; //@line 3026
  $$0 = $15 << 27 >> 31; //@line 3029
 } else {
  HEAP32[$0 >> 2] = $15 | 32; //@line 3032
  $$0 = -1; //@line 3033
 }
 return $$0 | 0; //@line 3035
}
function __ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$i = 0, $3 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 684
 $3 = HEAP32[$1 >> 2] | 0; //@line 685
 $5 = __ZNK13SocketAddress14get_ip_addressEv($2) | 0; //@line 687
 if (_emscripten_asm_const_iiii(5, $3 | 0, $5 | 0, (__ZNK13SocketAddress8get_portEv($2) | 0) & 65535 | 0) | 0) {
  $$0$i = -3012; //@line 693
  return $$0$i | 0; //@line 694
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 696
 _wait_ms(1); //@line 697
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 700
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 702
  sp = STACKTOP; //@line 703
  return 0; //@line 704
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 706
 HEAP8[$1 + 8 >> 0] = 1; //@line 708
 $$0$i = 0; //@line 709
 return $$0$i | 0; //@line 710
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 4700
 STACKTOP = STACKTOP + 256 | 0; //@line 4701
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 4701
 $5 = sp; //@line 4702
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 4708
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 4712
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 4715
   $$011 = $9; //@line 4716
   do {
    _out_670($0, $5, 256); //@line 4718
    $$011 = $$011 + -256 | 0; //@line 4719
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 4728
  } else {
   $$0$lcssa = $9; //@line 4730
  }
  _out_670($0, $5, $$0$lcssa); //@line 4732
 }
 STACKTOP = sp; //@line 4734
 return;
}
function _realloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1 = 0, $11 = 0, $14 = 0, $17 = 0, $22 = 0;
 if (!$0) {
  $$1 = _malloc($1) | 0; //@line 8577
  return $$1 | 0; //@line 8578
 }
 if ($1 >>> 0 > 4294967231) {
  HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 8583
  $$1 = 0; //@line 8584
  return $$1 | 0; //@line 8585
 }
 $11 = _try_realloc_chunk($0 + -8 | 0, $1 >>> 0 < 11 ? 16 : $1 + 11 & -8) | 0; //@line 8592
 if ($11 | 0) {
  $$1 = $11 + 8 | 0; //@line 8596
  return $$1 | 0; //@line 8597
 }
 $14 = _malloc($1) | 0; //@line 8599
 if (!$14) {
  $$1 = 0; //@line 8602
  return $$1 | 0; //@line 8603
 }
 $17 = HEAP32[$0 + -4 >> 2] | 0; //@line 8606
 $22 = ($17 & -8) - (($17 & 3 | 0) == 0 ? 8 : 4) | 0; //@line 8611
 _memcpy($14 | 0, $0 | 0, ($22 >>> 0 < $1 >>> 0 ? $22 : $1) | 0) | 0; //@line 8614
 _free($0); //@line 8615
 $$1 = $14; //@line 8616
 return $$1 | 0; //@line 8617
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_50($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1834
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1836
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1838
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1840
 $11 = HEAP32[(HEAP32[$2 >> 2] | 0) + 88 >> 2] | 0; //@line 1843
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1844
 $12 = FUNCTION_TABLE_iiiii[$11 & 15]($2, $4, $6, $8) | 0; //@line 1845
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 1848
  sp = STACKTOP; //@line 1849
  return;
 }
 HEAP32[___async_retval >> 2] = $12; //@line 1853
 ___async_unwind = 0; //@line 1854
 HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 1855
 sp = STACKTOP; //@line 1856
 return;
}
function __ZN17EthernetInterface14socket_connectEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $3 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 287
 $3 = HEAP32[$1 >> 2] | 0; //@line 288
 $5 = __ZNK13SocketAddress14get_ip_addressEv($2) | 0; //@line 290
 if (_emscripten_asm_const_iiii(5, $3 | 0, $5 | 0, (__ZNK13SocketAddress8get_portEv($2) | 0) & 65535 | 0) | 0) {
  $$0 = -3012; //@line 296
  return $$0 | 0; //@line 297
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 299
 _wait_ms(1); //@line 300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 303
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 305
  sp = STACKTOP; //@line 306
  return 0; //@line 307
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 309
 HEAP8[$1 + 8 >> 0] = 1; //@line 311
 $$0 = 0; //@line 312
 return $$0 | 0; //@line 313
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 9921
 STACKTOP = STACKTOP + 32 | 0; //@line 9922
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 9922
 $vararg_buffer = sp; //@line 9923
 $3 = sp + 20 | 0; //@line 9924
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 9928
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 9930
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 9932
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 9934
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 9936
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 9941
  $10 = -1; //@line 9942
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 9945
 }
 STACKTOP = sp; //@line 9947
 return $10 | 0; //@line 9947
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4358
 STACKTOP = STACKTOP + 16 | 0; //@line 4359
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4359
 $vararg_buffer = sp; //@line 4360
 HEAP32[$vararg_buffer >> 2] = $0; //@line 4361
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 4363
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 4365
 _mbed_error_printf(2294, $vararg_buffer); //@line 4366
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4367
 _mbed_die(); //@line 4368
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 4371
  sp = STACKTOP; //@line 4372
  STACKTOP = sp; //@line 4373
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4375
  STACKTOP = sp; //@line 4376
  return;
 }
}
function __ZN12NetworkStack14add_dns_serverERK13SocketAddress($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$byval_copy = 0, $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP; //@line 1149
 STACKTOP = STACKTOP + 48 | 0; //@line 1150
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1150
 $$byval_copy = sp + 20 | 0; //@line 1151
 $2 = sp; //@line 1152
 __ZNK13SocketAddress8get_addrEv($2, $1); //@line 1153
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 1154
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 1154
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 1154
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 1154
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1154
 $3 = _nsapi_dns_add_server($$byval_copy) | 0; //@line 1155
 STACKTOP = sp; //@line 1156
 return $3 | 0; //@line 1156
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6121
 STACKTOP = STACKTOP + 16 | 0; //@line 6122
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6122
 $1 = sp; //@line 6123
 HEAP32[$1 >> 2] = $varargs; //@line 6124
 $2 = HEAP32[171] | 0; //@line 6125
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6126
 $3 = _vfprintf($2, $0, $1) | 0; //@line 6127
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 6130
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6132
  sp = STACKTOP; //@line 6133
  STACKTOP = sp; //@line 6134
  return 0; //@line 6134
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6136
  STACKTOP = sp; //@line 6137
  return $3 | 0; //@line 6137
 }
 return 0; //@line 6139
}
function __ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv($0) {
 $0 = $0 | 0;
 var $$unpack$i = 0, $$unpack2$i = 0, $11 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1544
 $$unpack$i = HEAP32[$0 >> 2] | 0; //@line 1547
 $$unpack2$i = HEAP32[$0 + 4 >> 2] | 0; //@line 1549
 $4 = (HEAP32[$0 + 8 >> 2] | 0) + ($$unpack2$i >> 1) | 0; //@line 1551
 if (!($$unpack2$i & 1)) {
  $11 = $$unpack$i; //@line 1556
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack$i >> 2] | 0; //@line 1561
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1563
 FUNCTION_TABLE_vi[$11 & 255]($4); //@line 1564
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 1567
  sp = STACKTOP; //@line 1568
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1571
  return;
 }
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_33($0) {
 $0 = $0 | 0;
 var $$355$ = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 587
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 591
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 593
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 595
 $$355$ = ($AsyncRetVal | 0) == 0 ? HEAP32[$0 + 4 >> 2] | 0 : $AsyncRetVal; //@line 597
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(12) | 0; //@line 598
 __ZN9UDPSocketD2Ev($4); //@line 599
 if (!___async) {
  ___async_unwind = 0; //@line 602
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 82; //@line 604
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $6; //@line 606
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $$355$; //@line 608
 sp = STACKTOP; //@line 609
 return;
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6079
 STACKTOP = STACKTOP + 16 | 0; //@line 6080
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6080
 $2 = sp; //@line 6081
 HEAP32[$2 >> 2] = $varargs; //@line 6082
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6083
 $3 = _vsprintf($0, $1, $2) | 0; //@line 6084
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 6087
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6089
  sp = STACKTOP; //@line 6090
  STACKTOP = sp; //@line 6091
  return 0; //@line 6091
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6093
  STACKTOP = sp; //@line 6094
  return $3 | 0; //@line 6094
 }
 return 0; //@line 6096
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 6820
 $5 = HEAP32[$4 >> 2] | 0; //@line 6821
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 6825
   HEAP32[$1 + 24 >> 2] = $3; //@line 6827
   HEAP32[$1 + 36 >> 2] = 1; //@line 6829
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 6833
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 6836
    HEAP32[$1 + 24 >> 2] = 2; //@line 6838
    HEAP8[$1 + 54 >> 0] = 1; //@line 6840
    break;
   }
   $10 = $1 + 24 | 0; //@line 6843
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 6847
   }
  }
 } while (0);
 return;
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8402
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8404
 $6 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 16 >> 2] | 0; //@line 8407
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8408
 $7 = FUNCTION_TABLE_iii[$6 & 7]($AsyncRetVal, $2) | 0; //@line 8409
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 8412
  sp = STACKTOP; //@line 8413
  return;
 }
 HEAP32[___async_retval >> 2] = $7; //@line 8417
 ___async_unwind = 0; //@line 8418
 HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 8419
 sp = STACKTOP; //@line 8420
 return;
}
function __ZneRK13SocketAddressS1_($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$i = 0, $10 = 0, $11 = 0, $5 = 0, label = 0;
 if (__ZNK13SocketAddresscvbEv($0) | 0) {
  label = 3; //@line 2697
 } else {
  if (__ZNK13SocketAddresscvbEv($1) | 0) {
   label = 3; //@line 2701
  } else {
   $$0$i = 1; //@line 2703
  }
 }
 do {
  if ((label | 0) == 3) {
   $5 = HEAP32[$0 + 40 >> 2] | 0; //@line 2709
   if (($5 | 0) == (HEAP32[$1 + 40 >> 2] | 0)) {
    $10 = $0 + 44 | 0; //@line 2715
    $11 = $1 + 44 | 0; //@line 2716
    if (($5 | 0) == 1) {
     $$0$i = (_memcmp($10, $11, 4) | 0) == 0; //@line 2720
     break;
    } else {
     $$0$i = (_memcmp($10, $11, 16) | 0) == 0; //@line 2725
     break;
    }
   } else {
    $$0$i = 0; //@line 2729
   }
  }
 } while (0);
 return $$0$i ^ 1 | 0; //@line 2734
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 10028
 $3 = HEAP8[$1 >> 0] | 0; //@line 10029
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 10034
  $$lcssa8 = $2; //@line 10034
 } else {
  $$011 = $1; //@line 10036
  $$0710 = $0; //@line 10036
  do {
   $$0710 = $$0710 + 1 | 0; //@line 10038
   $$011 = $$011 + 1 | 0; //@line 10039
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 10040
   $9 = HEAP8[$$011 >> 0] | 0; //@line 10041
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 10046
  $$lcssa8 = $8; //@line 10046
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 10056
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3214
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3216
 $3 = _malloc($2) | 0; //@line 3217
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 3220
  if (!$5) {
   $$lcssa = 0; //@line 3223
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 3225
   FUNCTION_TABLE_v[$5 & 3](); //@line 3226
   if (!___async) {
    ___async_unwind = 0; //@line 3229
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 3231
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3233
   sp = STACKTOP; //@line 3234
   return;
  }
 } else {
  $$lcssa = $3; //@line 3238
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 3241
 return;
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4809
 $2 = HEAP32[171] | 0; //@line 4810
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4811
 _putc($1, $2) | 0; //@line 4812
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 111; //@line 4815
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 4817
  sp = STACKTOP; //@line 4818
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4821
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4822
 _fflush($2) | 0; //@line 4823
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 112; //@line 4826
  sp = STACKTOP; //@line 4827
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4830
  return;
 }
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7370
 STACKTOP = STACKTOP + 16 | 0; //@line 7371
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7371
 $vararg_buffer = sp; //@line 7372
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 7373
 FUNCTION_TABLE_v[$0 & 3](); //@line 7374
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 160; //@line 7377
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 7379
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 7381
  sp = STACKTOP; //@line 7382
  STACKTOP = sp; //@line 7383
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7385
  _abort_message(5782, $vararg_buffer); //@line 7386
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 9980
 STACKTOP = STACKTOP + 32 | 0; //@line 9981
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 9981
 $vararg_buffer = sp; //@line 9982
 HEAP32[$0 + 36 >> 2] = 9; //@line 9985
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 9993
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 9995
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 9997
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 10002
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 10005
 STACKTOP = sp; //@line 10006
 return $14 | 0; //@line 10006
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 5947
  } else {
   $$01318 = $0; //@line 5949
   $$01417 = $2; //@line 5949
   $$019 = $1; //@line 5949
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 5951
    $5 = HEAP8[$$019 >> 0] | 0; //@line 5952
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 5957
    if (!$$01417) {
     $14 = 0; //@line 5962
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 5965
     $$019 = $$019 + 1 | 0; //@line 5965
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 5971
  }
 } while (0);
 return $14 | 0; //@line 5974
}
function _mbed_die__async_cb_67($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2457
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2459
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2461
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2462
 _wait_ms(150); //@line 2463
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 94; //@line 2466
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2467
  HEAP32[$4 >> 2] = $2; //@line 2468
  sp = STACKTOP; //@line 2469
  return;
 }
 ___async_unwind = 0; //@line 2472
 HEAP32[$ReallocAsyncCtx15 >> 2] = 94; //@line 2473
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2474
 HEAP32[$4 >> 2] = $2; //@line 2475
 sp = STACKTOP; //@line 2476
 return;
}
function _mbed_die__async_cb_66($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2432
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2434
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2436
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2437
 _wait_ms(150); //@line 2438
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 95; //@line 2441
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2442
  HEAP32[$4 >> 2] = $2; //@line 2443
  sp = STACKTOP; //@line 2444
  return;
 }
 ___async_unwind = 0; //@line 2447
 HEAP32[$ReallocAsyncCtx14 >> 2] = 95; //@line 2448
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2449
 HEAP32[$4 >> 2] = $2; //@line 2450
 sp = STACKTOP; //@line 2451
 return;
}
function _mbed_die__async_cb_65($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2407
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2409
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2411
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2412
 _wait_ms(150); //@line 2413
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 96; //@line 2416
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2417
  HEAP32[$4 >> 2] = $2; //@line 2418
  sp = STACKTOP; //@line 2419
  return;
 }
 ___async_unwind = 0; //@line 2422
 HEAP32[$ReallocAsyncCtx13 >> 2] = 96; //@line 2423
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2424
 HEAP32[$4 >> 2] = $2; //@line 2425
 sp = STACKTOP; //@line 2426
 return;
}
function _mbed_die__async_cb_64($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2382
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2384
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2386
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2387
 _wait_ms(150); //@line 2388
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 97; //@line 2391
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2392
  HEAP32[$4 >> 2] = $2; //@line 2393
  sp = STACKTOP; //@line 2394
  return;
 }
 ___async_unwind = 0; //@line 2397
 HEAP32[$ReallocAsyncCtx12 >> 2] = 97; //@line 2398
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2399
 HEAP32[$4 >> 2] = $2; //@line 2400
 sp = STACKTOP; //@line 2401
 return;
}
function _mbed_die__async_cb_63($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2359
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2361
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2362
 _wait_ms(150); //@line 2363
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 98; //@line 2366
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2367
  HEAP32[$4 >> 2] = $2; //@line 2368
  sp = STACKTOP; //@line 2369
  return;
 }
 ___async_unwind = 0; //@line 2372
 HEAP32[$ReallocAsyncCtx11 >> 2] = 98; //@line 2373
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2374
 HEAP32[$4 >> 2] = $2; //@line 2375
 sp = STACKTOP; //@line 2376
 return;
}
function _mbed_die__async_cb_62($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2334
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2336
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 2337
 _wait_ms(150); //@line 2338
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 99; //@line 2341
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2342
  HEAP32[$4 >> 2] = $2; //@line 2343
  sp = STACKTOP; //@line 2344
  return;
 }
 ___async_unwind = 0; //@line 2347
 HEAP32[$ReallocAsyncCtx10 >> 2] = 99; //@line 2348
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2349
 HEAP32[$4 >> 2] = $2; //@line 2350
 sp = STACKTOP; //@line 2351
 return;
}
function _store_int_728($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 L1 : do {
  if ($0 | 0) {
   switch ($1 | 0) {
   case -2:
    {
     HEAP8[$0 >> 0] = $2; //@line 12129
     break L1;
     break;
    }
   case -1:
    {
     HEAP16[$0 >> 1] = $2; //@line 12135
     break L1;
     break;
    }
   case 0:
    {
     HEAP32[$0 >> 2] = $2; //@line 12140
     break L1;
     break;
    }
   case 1:
    {
     HEAP32[$0 >> 2] = $2; //@line 12145
     break L1;
     break;
    }
   case 3:
    {
     $7 = $0; //@line 12150
     HEAP32[$7 >> 2] = $2; //@line 12152
     HEAP32[$7 + 4 >> 2] = $3; //@line 12155
     break L1;
     break;
    }
   default:
    {
     break L1;
    }
   }
  }
 } while (0);
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 2082
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2084
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2086
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 2087
 _wait_ms(150); //@line 2088
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 93; //@line 2091
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2092
  HEAP32[$4 >> 2] = $2; //@line 2093
  sp = STACKTOP; //@line 2094
  return;
 }
 ___async_unwind = 0; //@line 2097
 HEAP32[$ReallocAsyncCtx16 >> 2] = 93; //@line 2098
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2099
 HEAP32[$4 >> 2] = $2; //@line 2100
 sp = STACKTOP; //@line 2101
 return;
}
function _vsscanf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $8 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11006
 STACKTOP = STACKTOP + 128 | 0; //@line 11007
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11007
 $3 = sp; //@line 11008
 dest = $3; //@line 11009
 stop = dest + 124 | 0; //@line 11009
 do {
  HEAP32[dest >> 2] = 0; //@line 11009
  dest = dest + 4 | 0; //@line 11009
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 + 32 >> 2] = 14; //@line 11011
 HEAP32[$3 + 44 >> 2] = $0; //@line 11013
 HEAP32[$3 + 76 >> 2] = -1; //@line 11015
 HEAP32[$3 + 84 >> 2] = $0; //@line 11017
 $8 = _vfscanf($3, $1, $2) | 0; //@line 11018
 STACKTOP = sp; //@line 11019
 return $8 | 0; //@line 11019
}
function _mbed_die__async_cb_61($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2309
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2311
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 2312
 _wait_ms(150); //@line 2313
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 2316
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2317
  HEAP32[$4 >> 2] = $2; //@line 2318
  sp = STACKTOP; //@line 2319
  return;
 }
 ___async_unwind = 0; //@line 2322
 HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 2323
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2324
 HEAP32[$4 >> 2] = $2; //@line 2325
 sp = STACKTOP; //@line 2326
 return;
}
function _mbed_die__async_cb_60($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2282
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2284
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2286
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2287
 _wait_ms(400); //@line 2288
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 101; //@line 2291
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2292
  HEAP32[$4 >> 2] = $2; //@line 2293
  sp = STACKTOP; //@line 2294
  return;
 }
 ___async_unwind = 0; //@line 2297
 HEAP32[$ReallocAsyncCtx8 >> 2] = 101; //@line 2298
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2299
 HEAP32[$4 >> 2] = $2; //@line 2300
 sp = STACKTOP; //@line 2301
 return;
}
function _mbed_die__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2257
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2259
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2261
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2262
 _wait_ms(400); //@line 2263
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 102; //@line 2266
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2267
  HEAP32[$4 >> 2] = $2; //@line 2268
  sp = STACKTOP; //@line 2269
  return;
 }
 ___async_unwind = 0; //@line 2272
 HEAP32[$ReallocAsyncCtx7 >> 2] = 102; //@line 2273
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2274
 HEAP32[$4 >> 2] = $2; //@line 2275
 sp = STACKTOP; //@line 2276
 return;
}
function _mbed_die__async_cb_58($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2232
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2234
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2236
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 2237
 _wait_ms(400); //@line 2238
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 103; //@line 2241
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2242
  HEAP32[$4 >> 2] = $2; //@line 2243
  sp = STACKTOP; //@line 2244
  return;
 }
 ___async_unwind = 0; //@line 2247
 HEAP32[$ReallocAsyncCtx6 >> 2] = 103; //@line 2248
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2249
 HEAP32[$4 >> 2] = $2; //@line 2250
 sp = STACKTOP; //@line 2251
 return;
}
function _mbed_die__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2207
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2209
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2211
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 2212
 _wait_ms(400); //@line 2213
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 104; //@line 2216
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2217
  HEAP32[$4 >> 2] = $2; //@line 2218
  sp = STACKTOP; //@line 2219
  return;
 }
 ___async_unwind = 0; //@line 2222
 HEAP32[$ReallocAsyncCtx5 >> 2] = 104; //@line 2223
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2224
 HEAP32[$4 >> 2] = $2; //@line 2225
 sp = STACKTOP; //@line 2226
 return;
}
function _mbed_die__async_cb_56($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2182
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2184
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2186
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 2187
 _wait_ms(400); //@line 2188
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 105; //@line 2191
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2192
  HEAP32[$4 >> 2] = $2; //@line 2193
  sp = STACKTOP; //@line 2194
  return;
 }
 ___async_unwind = 0; //@line 2197
 HEAP32[$ReallocAsyncCtx4 >> 2] = 105; //@line 2198
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2199
 HEAP32[$4 >> 2] = $2; //@line 2200
 sp = STACKTOP; //@line 2201
 return;
}
function _mbed_die__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2157
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2159
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2161
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2162
 _wait_ms(400); //@line 2163
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 2166
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2167
  HEAP32[$4 >> 2] = $2; //@line 2168
  sp = STACKTOP; //@line 2169
  return;
 }
 ___async_unwind = 0; //@line 2172
 HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 2173
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2174
 HEAP32[$4 >> 2] = $2; //@line 2175
 sp = STACKTOP; //@line 2176
 return;
}
function _mbed_die__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2132
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2134
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2136
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2137
 _wait_ms(400); //@line 2138
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 107; //@line 2141
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2142
  HEAP32[$4 >> 2] = $2; //@line 2143
  sp = STACKTOP; //@line 2144
  return;
 }
 ___async_unwind = 0; //@line 2147
 HEAP32[$ReallocAsyncCtx2 >> 2] = 107; //@line 2148
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2149
 HEAP32[$4 >> 2] = $2; //@line 2150
 sp = STACKTOP; //@line 2151
 return;
}
function __ZThn4_N17EthernetInterface11socket_recvEPvS0_j($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0$i = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 752
 $6 = _emscripten_asm_const_iiii(7, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 755
 if (($6 | 0) < 0) {
  $$0$i = -3001; //@line 758
  return $$0$i | 0; //@line 759
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 761
 _wait_ms(1); //@line 762
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 765
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 767
  sp = STACKTOP; //@line 768
  return 0; //@line 769
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 771
 $$0$i = $6; //@line 772
 return $$0$i | 0; //@line 773
}
function _mbed_die__async_cb_53($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2107
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2109
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2111
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2112
 _wait_ms(400); //@line 2113
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 2116
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 2117
  HEAP32[$4 >> 2] = $2; //@line 2118
  sp = STACKTOP; //@line 2119
  return;
 }
 ___async_unwind = 0; //@line 2122
 HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 2123
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 2124
 HEAP32[$4 >> 2] = $2; //@line 2125
 sp = STACKTOP; //@line 2126
 return;
}
function __ZN17EthernetInterface11socket_recvEPvS0_j($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 355
 $6 = _emscripten_asm_const_iiii(7, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 358
 if (($6 | 0) < 0) {
  $$0 = -3001; //@line 361
  return $$0 | 0; //@line 362
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 364
 _wait_ms(1); //@line 365
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 368
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 370
  sp = STACKTOP; //@line 371
  return 0; //@line 372
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 374
 $$0 = $6; //@line 375
 return $$0 | 0; //@line 376
}
function __ZThn4_N17EthernetInterface12socket_closeEPv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 638
 $3 = _emscripten_asm_const_ii(4, HEAP32[$1 >> 2] | 0) | 0; //@line 640
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 641
 _wait_ms(1); //@line 642
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 645
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 647
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 649
  sp = STACKTOP; //@line 650
  return 0; //@line 651
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 653
 HEAP8[$1 + 8 >> 0] = 0; //@line 655
 if (!$1) {
  return $3 | 0; //@line 658
 }
 __ZdlPv($1); //@line 660
 return $3 | 0; //@line 661
}
function __ZN17EthernetInterface12socket_closeEPv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 241
 $3 = _emscripten_asm_const_ii(4, HEAP32[$1 >> 2] | 0) | 0; //@line 243
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 244
 _wait_ms(1); //@line 245
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 248
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 250
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 252
  sp = STACKTOP; //@line 253
  return 0; //@line 254
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 256
 HEAP8[$1 + 8 >> 0] = 0; //@line 258
 if (!$1) {
  return $3 | 0; //@line 261
 }
 __ZdlPv($1); //@line 263
 return $3 | 0; //@line 264
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 10162
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 10164
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 10170
  $11 = ___fwritex($0, $4, $3) | 0; //@line 10171
  if ($phitmp) {
   $13 = $11; //@line 10173
  } else {
   ___unlockfile($3); //@line 10175
   $13 = $11; //@line 10176
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 10180
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 10184
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 10187
 }
 return $15 | 0; //@line 10189
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 4716
 newDynamicTop = oldDynamicTop + increment | 0; //@line 4717
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 4721
  ___setErrNo(12); //@line 4722
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 4726
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 4730
   ___setErrNo(12); //@line 4731
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 4735
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 4561
 } else {
  $$056 = $2; //@line 4563
  $15 = $1; //@line 4563
  $8 = $0; //@line 4563
  while (1) {
   $14 = $$056 + -1 | 0; //@line 4571
   HEAP8[$14 >> 0] = HEAPU8[3445 + ($8 & 15) >> 0] | 0 | $3; //@line 4572
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 4573
   $15 = tempRet0; //@line 4574
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 4579
    break;
   } else {
    $$056 = $14; //@line 4582
   }
  }
 }
 return $$05$lcssa | 0; //@line 4586
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 10379
 $3 = HEAP8[$1 >> 0] | 0; //@line 10381
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 10385
 $7 = HEAP32[$0 >> 2] | 0; //@line 10386
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 10391
  HEAP32[$0 + 4 >> 2] = 0; //@line 10393
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 10395
  HEAP32[$0 + 28 >> 2] = $14; //@line 10397
  HEAP32[$0 + 20 >> 2] = $14; //@line 10399
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 10405
  $$0 = 0; //@line 10406
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 10409
  $$0 = -1; //@line 10410
 }
 return $$0 | 0; //@line 10412
}
function __ZN9UDPSocket5eventEv($0) {
 $0 = $0 | 0;
 var $$pre = 0, $1 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2827
 $1 = $0 + 52 | 0; //@line 2828
 HEAP32[$1 >> 2] = (HEAP32[$1 >> 2] | 0) + 1; //@line 2831
 $6 = HEAP32[$0 + 44 >> 2] | 0; //@line 2834
 if (!$6) {
  return;
 }
 if ((HEAP32[$1 >> 2] | 0) != 1) {
  return;
 }
 $$pre = HEAP32[$6 >> 2] | 0; //@line 2844
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2845
 FUNCTION_TABLE_vi[$$pre & 255]($0 + 32 | 0); //@line 2846
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 2849
  sp = STACKTOP; //@line 2850
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2853
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 7335
 $0 = ___cxa_get_globals_fast() | 0; //@line 7336
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 7339
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 7343
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 7355
    _emscripten_alloc_async_context(4, sp) | 0; //@line 7356
    __ZSt11__terminatePFvvE($16); //@line 7357
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 7362
 _emscripten_alloc_async_context(4, sp) | 0; //@line 7363
 __ZSt11__terminatePFvvE($17); //@line 7364
}
function __ZN9UDPSocketD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1650
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1652
 $4 = HEAP32[$2 + 28 >> 2] | 0; //@line 1654
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1661
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1662
 FUNCTION_TABLE_vi[$8 & 255]($2 + 16 | 0); //@line 1663
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 1666
  sp = STACKTOP; //@line 1667
  return;
 }
 ___async_unwind = 0; //@line 1670
 HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 1671
 sp = STACKTOP; //@line 1672
 return;
}
function __ZN6SocketD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2048
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2050
 $4 = HEAP32[$2 + 28 >> 2] | 0; //@line 2052
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2059
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2060
 FUNCTION_TABLE_vi[$8 & 255]($2 + 16 | 0); //@line 2061
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 55; //@line 2064
  sp = STACKTOP; //@line 2065
  return;
 }
 ___async_unwind = 0; //@line 2068
 HEAP32[$ReallocAsyncCtx2 >> 2] = 55; //@line 2069
 sp = STACKTOP; //@line 2070
 return;
}
function _arg_n_727($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $2 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 12084
 STACKTOP = STACKTOP + 16 | 0; //@line 12085
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12085
 $2 = sp; //@line 12086
 HEAP32[$2 >> 2] = HEAP32[$0 >> 2]; //@line 12088
 $$0 = $1; //@line 12089
 while (1) {
  $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 12103
  $10 = HEAP32[$9 >> 2] | 0; //@line 12104
  HEAP32[$2 >> 2] = $9 + 4; //@line 12106
  if ($$0 >>> 0 > 1) {
   $$0 = $$0 + -1 | 0; //@line 12109
  } else {
   break;
  }
 }
 STACKTOP = sp; //@line 12114
 return $10 | 0; //@line 12114
}
function __ZThn4_N17EthernetInterface11socket_sendEPvPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 727
 $6 = _emscripten_asm_const_iiii(6, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 730
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 731
 _wait_ms(1); //@line 732
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 735
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 737
  sp = STACKTOP; //@line 738
  return 0; //@line 739
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 741
  return $6 | 0; //@line 742
 }
 return 0; //@line 744
}
function __ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 893
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 895
 $4 = __Z18nsapi_create_stackP12NetworkStack(HEAP32[___async_retval >> 2] | 0) | 0; //@line 898
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 899
 __ZN6Socket4openEP12NetworkStack($2, $4) | 0; //@line 900
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 903
  sp = STACKTOP; //@line 904
  return;
 }
 ___async_unwind = 0; //@line 907
 HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 908
 sp = STACKTOP; //@line 909
 return;
}
function ___string_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$027 = 0, $$027$ = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 $3 = $0 + 84 | 0; //@line 3043
 $4 = HEAP32[$3 >> 2] | 0; //@line 3044
 $5 = $2 + 256 | 0; //@line 3045
 $6 = _memchr($4, 0, $5) | 0; //@line 3046
 $$027 = ($6 | 0) == 0 ? $5 : $6 - $4 | 0; //@line 3051
 $$027$ = $$027 >>> 0 < $2 >>> 0 ? $$027 : $2; //@line 3053
 _memcpy($1 | 0, $4 | 0, $$027$ | 0) | 0; //@line 3054
 HEAP32[$0 + 4 >> 2] = $4 + $$027$; //@line 3057
 $14 = $4 + $$027 | 0; //@line 3058
 HEAP32[$0 + 8 >> 2] = $14; //@line 3060
 HEAP32[$3 >> 2] = $14; //@line 3061
 return $$027$ | 0; //@line 3062
}
function __ZN17EthernetInterface11socket_sendEPvPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 330
 $6 = _emscripten_asm_const_iiii(6, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 333
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 334
 _wait_ms(1); //@line 335
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 338
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 340
  sp = STACKTOP; //@line 341
  return 0; //@line 342
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 344
  return $6 | 0; //@line 345
 }
 return 0; //@line 347
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 4598
 } else {
  $$06 = $2; //@line 4600
  $11 = $1; //@line 4600
  $7 = $0; //@line 4600
  while (1) {
   $10 = $$06 + -1 | 0; //@line 4605
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 4606
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 4607
   $11 = tempRet0; //@line 4608
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 4613
    break;
   } else {
    $$06 = $10; //@line 4616
   }
  }
 }
 return $$0$lcssa | 0; //@line 4620
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb_10($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8781
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8785
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8787
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8788
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 8789
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 64; //@line 8792
  sp = STACKTOP; //@line 8793
  return;
 }
 ___async_unwind = 0; //@line 8796
 HEAP32[$ReallocAsyncCtx >> 2] = 64; //@line 8797
 sp = STACKTOP; //@line 8798
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8220
 do {
  if (!$0) {
   $3 = 0; //@line 8224
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8226
   $2 = ___dynamic_cast($0, 104, 160, 0) | 0; //@line 8227
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 174; //@line 8230
    sp = STACKTOP; //@line 8231
    return 0; //@line 8232
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8234
    $3 = ($2 | 0) != 0 & 1; //@line 8237
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 8242
}
function _invoke_ticker__async_cb_21($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9714
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 9720
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 9721
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9722
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 9723
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 9726
  sp = STACKTOP; //@line 9727
  return;
 }
 ___async_unwind = 0; //@line 9730
 HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 9731
 sp = STACKTOP; //@line 9732
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 4242
 } else {
  $$04 = 0; //@line 4244
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 4247
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 4251
   $12 = $7 + 1 | 0; //@line 4252
   HEAP32[$0 >> 2] = $12; //@line 4253
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 4259
    break;
   } else {
    $$04 = $11; //@line 4262
   }
  }
 }
 return $$0$lcssa | 0; //@line 4266
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 4229
 $y_sroa_0_0_extract_trunc = $b$0; //@line 4230
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 4231
 $1$1 = tempRet0; //@line 4232
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 4234
}
function __ZThn4_N17EthernetInterface14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 563
 $2 = _emscripten_asm_const_ii(1, 0) | 0; //@line 565
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 566
 _wait_ms(1); //@line 567
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 570
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 572
  sp = STACKTOP; //@line 573
  return 0; //@line 574
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 576
  return $2 | 0; //@line 577
 }
 return 0; //@line 579
}
function _memmove(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0;
 if ((src | 0) < (dest | 0) & (dest | 0) < (src + num | 0)) {
  ret = dest; //@line 4647
  src = src + num | 0; //@line 4648
  dest = dest + num | 0; //@line 4649
  while ((num | 0) > 0) {
   dest = dest - 1 | 0; //@line 4651
   src = src - 1 | 0; //@line 4652
   num = num - 1 | 0; //@line 4653
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 4654
  }
  dest = ret; //@line 4656
 } else {
  _memcpy(dest, src, num) | 0; //@line 4658
 }
 return dest | 0; //@line 4660
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 4214
 $2 = $b & 65535; //@line 4215
 $3 = Math_imul($2, $1) | 0; //@line 4216
 $6 = $a >>> 16; //@line 4217
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 4218
 $11 = $b >>> 16; //@line 4219
 $12 = Math_imul($11, $1) | 0; //@line 4220
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 4221
}
function __ZN6SocketC2Ev($0) {
 $0 = $0 | 0;
 var $4 = 0;
 HEAP32[$0 >> 2] = 404; //@line 1210
 HEAP32[$0 + 4 >> 2] = 0; //@line 1212
 HEAP32[$0 + 8 >> 2] = 0; //@line 1214
 HEAP32[$0 + 12 >> 2] = -1; //@line 1216
 $4 = $0 + 16 | 0; //@line 1217
 HEAP32[$4 >> 2] = 0; //@line 1218
 HEAP32[$4 + 4 >> 2] = 0; //@line 1218
 HEAP32[$4 + 8 >> 2] = 0; //@line 1218
 HEAP32[$4 + 12 >> 2] = 0; //@line 1218
 HEAP32[$4 + 16 >> 2] = 0; //@line 1218
 HEAP32[$4 + 20 >> 2] = 0; //@line 1218
 HEAP32[$4 + 24 >> 2] = 0; //@line 1218
 HEAP32[$4 + 28 >> 2] = 0; //@line 1218
 return;
}
function __ZN17EthernetInterface11get_netmaskEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 103
 $2 = _emscripten_asm_const_ii(2, 0) | 0; //@line 105
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 106
 _wait_ms(1); //@line 107
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 20; //@line 110
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 112
  sp = STACKTOP; //@line 113
  return 0; //@line 114
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 116
  return $2 | 0; //@line 117
 }
 return 0; //@line 119
}
function __ZN17EthernetInterface15get_mac_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 61
 $2 = _emscripten_asm_const_ii(0, 0) | 0; //@line 63
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 64
 _wait_ms(1); //@line 65
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 18; //@line 68
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 70
  sp = STACKTOP; //@line 71
  return 0; //@line 72
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 74
  return $2 | 0; //@line 75
 }
 return 0; //@line 77
}
function __ZN17EthernetInterface14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 82
 $2 = _emscripten_asm_const_ii(1, 0) | 0; //@line 84
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 85
 _wait_ms(1); //@line 86
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 19; //@line 89
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 91
  sp = STACKTOP; //@line 92
  return 0; //@line 93
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 95
  return $2 | 0; //@line 96
 }
 return 0; //@line 98
}
function ___fflush_unlocked__async_cb_74($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3412
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3414
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3416
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3418
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 3420
 HEAP32[$4 >> 2] = 0; //@line 3421
 HEAP32[$6 >> 2] = 0; //@line 3422
 HEAP32[$8 >> 2] = 0; //@line 3423
 HEAP32[$10 >> 2] = 0; //@line 3424
 HEAP32[___async_retval >> 2] = 0; //@line 3426
 return;
}
function ___uflow($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, sp = 0;
 sp = STACKTOP; //@line 2966
 STACKTOP = STACKTOP + 16 | 0; //@line 2967
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2967
 $1 = sp; //@line 2968
 if (!(___toread($0) | 0)) {
  if ((FUNCTION_TABLE_iiii[HEAP32[$0 + 32 >> 2] & 15]($0, $1, 1) | 0) == 1) {
   $$0 = HEAPU8[$1 >> 0] | 0; //@line 2979
  } else {
   $$0 = -1; //@line 2981
  }
 } else {
  $$0 = -1; //@line 2984
 }
 STACKTOP = sp; //@line 2986
 return $$0 | 0; //@line 2986
}
function __ZN17EthernetInterface11set_networkEPKcS1_S1_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 133
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 134
 _puts(2037) | 0; //@line 135
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 21; //@line 138
  sp = STACKTOP; //@line 139
  return 0; //@line 140
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 142
  return 0; //@line 143
 }
 return 0; //@line 145
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6103
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6104
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 6105
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 141; //@line 6108
  sp = STACKTOP; //@line 6109
  return 0; //@line 6110
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6112
  return $3 | 0; //@line 6113
 }
 return 0; //@line 6115
}
function _serial_putc__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8561
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8563
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8564
 _fflush($2) | 0; //@line 8565
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 112; //@line 8568
  sp = STACKTOP; //@line 8569
  return;
 }
 ___async_unwind = 0; //@line 8572
 HEAP32[$ReallocAsyncCtx >> 2] = 112; //@line 8573
 sp = STACKTOP; //@line 8574
 return;
}
function __ZN13SocketAddressC2E10nsapi_addrt($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 HEAP8[$0 >> 0] = 0; //@line 1681
 $3 = $0 + 40 | 0; //@line 1682
 HEAP32[$3 >> 2] = HEAP32[$1 >> 2]; //@line 1683
 HEAP32[$3 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1683
 HEAP32[$3 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1683
 HEAP32[$3 + 12 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1683
 HEAP32[$3 + 16 >> 2] = HEAP32[$1 + 16 >> 2]; //@line 1683
 HEAP16[$0 + 60 >> 1] = $2; //@line 1685
 return;
}
function _copysign($0, $1) {
 $0 = +$0;
 $1 = +$1;
 var $2 = 0, $3 = 0, $8 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2947
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2947
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2948
 HEAPF64[tempDoublePtr >> 3] = $1; //@line 2949
 $8 = HEAP32[tempDoublePtr + 4 >> 2] & -2147483648 | $3 & 2147483647; //@line 2953
 HEAP32[tempDoublePtr >> 2] = $2; //@line 2954
 HEAP32[tempDoublePtr + 4 >> 2] = $8; //@line 2954
 return +(+HEAPF64[tempDoublePtr >> 3]);
}
function _emscripten_async_resume() {
 ___async = 0; //@line 4547
 ___async_unwind = 1; //@line 4548
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 4554
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 4558
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 4562
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 4564
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 9791
 STACKTOP = STACKTOP + 16 | 0; //@line 9792
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9792
 $vararg_buffer = sp; //@line 9793
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 9797
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 9799
 STACKTOP = sp; //@line 9800
 return $5 | 0; //@line 9800
}
function __ZN9UDPSocketD0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2802
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2803
 __ZN9UDPSocketD2Ev($0); //@line 2804
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 2807
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2809
  sp = STACKTOP; //@line 2810
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2813
  __ZdlPv($0); //@line 2814
  return;
 }
}
function __ZN17EthernetInterface8set_dhcpEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 151
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 152
 _puts(1992) | 0; //@line 153
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 156
  sp = STACKTOP; //@line 157
  return 0; //@line 158
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 160
  return 0; //@line 161
 }
 return 0; //@line 163
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 4489
 STACKTOP = STACKTOP + 16 | 0; //@line 4490
 $rem = __stackBase__ | 0; //@line 4491
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 4492
 STACKTOP = __stackBase__; //@line 4493
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 4494
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 4259
 if ((ret | 0) < 8) return ret | 0; //@line 4260
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 4261
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 4262
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 4263
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 4264
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 4265
}
function __ZN13SocketAddress8set_addrE10nsapi_addr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP8[$0 >> 0] = 0; //@line 1693
 $2 = $0 + 40 | 0; //@line 1694
 HEAP32[$2 >> 2] = HEAP32[$1 >> 2]; //@line 1695
 HEAP32[$2 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1695
 HEAP32[$2 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1695
 HEAP32[$2 + 12 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1695
 HEAP32[$2 + 16 >> 2] = HEAP32[$1 + 16 >> 2]; //@line 1695
 return;
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 6556
 STACKTOP = STACKTOP + 16 | 0; //@line 6557
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6557
 if (!(_pthread_once(6528, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1633] | 0) | 0; //@line 6563
  STACKTOP = sp; //@line 6564
  return $3 | 0; //@line 6564
 } else {
  _abort_message(5630, sp); //@line 6566
 }
 return 0; //@line 6569
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 6724
 }
 return;
}
function __ZThn4_N17EthernetInterface12socket_closeEPv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $7 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1913
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1915
 HEAP8[$2 + 8 >> 0] = 0; //@line 1917
 if (!$2) {
  $7 = ___async_retval; //@line 1920
  HEAP32[$7 >> 2] = $4; //@line 1921
  return;
 }
 __ZdlPv($2); //@line 1924
 $7 = ___async_retval; //@line 1925
 HEAP32[$7 >> 2] = $4; //@line 1926
 return;
}
function _sscanf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP; //@line 10994
 STACKTOP = STACKTOP + 16 | 0; //@line 10995
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10995
 $2 = sp; //@line 10996
 HEAP32[$2 >> 2] = $varargs; //@line 10997
 $3 = _vsscanf($0, $1, $2) | 0; //@line 10998
 STACKTOP = sp; //@line 10999
 return $3 | 0; //@line 10999
}
function __ZL25default_terminate_handlerv__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3820
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3822
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3824
 HEAP32[$2 >> 2] = 5491; //@line 3825
 HEAP32[$2 + 4 >> 2] = $4; //@line 3827
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 3829
 _abort_message(5355, $2); //@line 3830
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 6062
 $6 = HEAP32[$5 >> 2] | 0; //@line 6063
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 6064
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 6066
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 6068
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 6071
 return $2 | 0; //@line 6072
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3836
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3838
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3839
 _fputc(10, $2) | 0; //@line 3840
 if (!___async) {
  ___async_unwind = 0; //@line 3843
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 150; //@line 3845
 sp = STACKTOP; //@line 3846
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4150
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 4153
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 4158
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4161
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3273
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 3284
  $$0 = 1; //@line 3285
 } else {
  $$0 = 0; //@line 3287
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 3291
 return;
}
function __ZNK13SocketAddress8get_addrEv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = $1 + 40 | 0; //@line 2338
 HEAP32[$0 >> 2] = HEAP32[$2 >> 2]; //@line 2339
 HEAP32[$0 + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 2339
 HEAP32[$0 + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 2339
 HEAP32[$0 + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 2339
 HEAP32[$0 + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2339
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 7318
 STACKTOP = STACKTOP + 16 | 0; //@line 7319
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7319
 _free($0); //@line 7321
 if (!(_pthread_setspecific(HEAP32[1633] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 7326
  return;
 } else {
  _abort_message(5729, sp); //@line 7328
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 4788
 HEAP32[$0 >> 2] = $1; //@line 4789
 HEAP32[1484] = 1; //@line 4790
 $4 = $0; //@line 4791
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 4796
 $10 = 5940; //@line 4797
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 4799
 HEAP32[$10 + 4 >> 2] = $9; //@line 4802
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 6800
 }
 return;
}
function ___shlim($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $4 = 0, $6 = 0, $7 = 0;
 HEAP32[$0 + 104 >> 2] = $1; //@line 11969
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11971
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11973
 $7 = $4 - $6 | 0; //@line 11974
 HEAP32[$0 + 108 >> 2] = $7; //@line 11976
 HEAP32[$0 + 100 >> 2] = ($1 | 0) != 0 & ($7 | 0) > ($1 | 0) ? $6 + $1 | 0 : $4; //@line 11985
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4892
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4893
 _emscripten_sleep($0 | 0); //@line 4894
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 4897
  sp = STACKTOP; //@line 4898
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4901
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 6864
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 6868
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 7303
 STACKTOP = STACKTOP + 16 | 0; //@line 7304
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7304
 if (!(_pthread_key_create(6532, 159) | 0)) {
  STACKTOP = sp; //@line 7309
  return;
 } else {
  _abort_message(5679, sp); //@line 7311
 }
}
function _nsapi_dns_add_server($0) {
 $0 = $0 | 0;
 _memmove(476, 456, 80) | 0; //@line 3115
 HEAP32[114] = HEAP32[$0 >> 2]; //@line 3116
 HEAP32[115] = HEAP32[$0 + 4 >> 2]; //@line 3116
 HEAP32[116] = HEAP32[$0 + 8 >> 2]; //@line 3116
 HEAP32[117] = HEAP32[$0 + 12 >> 2]; //@line 3116
 HEAP32[118] = HEAP32[$0 + 16 >> 2]; //@line 3116
 return 0; //@line 3117
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 4523
 HEAP32[new_frame + 4 >> 2] = sp; //@line 4525
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 4527
 ___async_cur_frame = new_frame; //@line 4528
 return ___async_cur_frame + 8 | 0; //@line 4529
}
function __ZThn4_N17EthernetInterface13socket_attachEPvPFvS0_ES0_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0, $5 = 0;
 $4 = $0 + -4 | 0; //@line 944
 $5 = HEAP32[$1 >> 2] | 0; //@line 945
 HEAP32[$4 + 60 + ($5 << 3) >> 2] = $2; //@line 947
 HEAP32[$4 + 60 + ($5 << 3) + 4 >> 2] = $3; //@line 949
 return;
}
function __ZN17EthernetInterface12socket_closeEPv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3757
 HEAP8[$2 + 8 >> 0] = 0; //@line 3759
 if ($2 | 0) {
  __ZdlPv($2); //@line 3762
 }
 HEAP32[___async_retval >> 2] = $4; //@line 3765
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 3868
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 3872
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 3875
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 4512
  return low << bits; //@line 4513
 }
 tempRet0 = low << bits - 32; //@line 4515
 return 0; //@line 4516
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 4501
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 4502
 }
 tempRet0 = 0; //@line 4504
 return high >>> bits - 32 | 0; //@line 4505
}
function __ZN4mbed8CallbackIFvvEE13function_moveINS2_14method_contextI6SocketMS5_FvvEEEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 1580
 HEAP32[$0 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1580
 HEAP32[$0 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1580
 return;
}
function __ZN17EthernetInterface13socket_attachEPvPFvS0_ES0_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = HEAP32[$1 >> 2] | 0; //@line 539
 HEAP32[$0 + 60 + ($4 << 3) >> 2] = $2; //@line 541
 HEAP32[$0 + 60 + ($4 << 3) + 4 >> 2] = $3; //@line 543
 return;
}
function _fflush__async_cb_80($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3959
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 3961
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3964
 return;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(size | 0); //@line 7
 return ret | 0; //@line 9
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1394
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1397
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1400
 return;
}
function dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 return FUNCTION_TABLE_iiiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0) | 0; //@line 4777
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1749
 } else {
  $$0 = -1; //@line 1751
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1754
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 10509
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 10515
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 10519
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 4819
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 4535
 stackRestore(___async_cur_frame | 0); //@line 4536
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 4537
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 832
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 833
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 835
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 874
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 875
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 877
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 4764
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 4770
 _emscripten_asm_const_iii(9, $0 | 0, $1 | 0) | 0; //@line 4771
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 5683
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 5683
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 5685
 return $1 | 0; //@line 5686
}
function ___DOUBLE_BITS_563($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2937
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2937
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2939
 return $1 | 0; //@line 2940
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 9957
  $$0 = -1; //@line 9958
 } else {
  $$0 = $0; //@line 9960
 }
 return $$0 | 0; //@line 9962
}
function dynCall_iiiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 return FUNCTION_TABLE_iiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0) | 0; //@line 4770
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 4252
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 4253
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 4254
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 4812
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 966
 ___cxa_begin_catch($0 | 0) | 0; //@line 967
 _emscripten_alloc_async_context(4, sp) | 0; //@line 968
 __ZSt9terminatev(); //@line 969
}
function __ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[(HEAP32[$0 + 4 >> 2] | 0) + 8 >> 0] = 1; //@line 3263
 HEAP32[___async_retval >> 2] = 0; //@line 3265
 return;
}
function __ZN17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[(HEAP32[$0 + 4 >> 2] | 0) + 8 >> 0] = 1; //@line 8311
 HEAP32[___async_retval >> 2] = 0; //@line 8313
 return;
}
function dynCall_iiiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 return FUNCTION_TABLE_iiiii[index & 15](a1 | 0, a2 | 0, a3 | 0, a4 | 0) | 0; //@line 4763
}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 4244
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 4246
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 4805
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_1($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8295
 return;
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_51($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1905
 return;
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 4743
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 4746
 }
 return $$0 | 0; //@line 4748
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_32($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 8 >> 2]; //@line 581
 return;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_7($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8713
 return;
}
function __ZN17EthernetInterfaceC2Ev($0) {
 $0 = $0 | 0;
 HEAP32[$0 >> 2] = 200; //@line 957
 HEAP32[$0 + 4 >> 2] = 316; //@line 958
 _memset($0 + 60 | 0, 0, 800) | 0; //@line 960
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_48($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1818
 return;
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 4756
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 10149
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 10153
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_45($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1498
 return;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 4481
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 4062
 return;
}
function b25(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_iiiiiii(3); //@line 4880
 return 0; //@line 4880
}
function b24(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_iiiiiii(0); //@line 4877
 return 0; //@line 4877
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb_3($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8430
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_84($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 4205
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 4542
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 4543
}
function _mbsinit($0) {
 $0 = $0 | 0;
 var $4 = 0;
 if (!$0) {
  $4 = 1; //@line 146
 } else {
  $4 = (HEAP32[$0 >> 2] | 0) == 0 & 1; //@line 151
 }
 return $4 | 0; //@line 153
}
function __ZN12NetworkStack10getsockoptEPviiS0_Pj($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 return -3002;
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN12NetworkStack10setsockoptEPviiPKvj($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 return -3002;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_8($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = -3012; //@line 8721
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 10645
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 10647
}
function __ZN9UDPSocketC2Ev($0) {
 $0 = $0 | 0;
 __ZN6SocketC2Ev($0); //@line 2860
 HEAP32[$0 >> 2] = 440; //@line 2861
 HEAP32[$0 + 52 >> 2] = 0; //@line 2863
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7403
 __ZdlPv($0); //@line 7404
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_49($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = -3012; //@line 1826
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7086
 __ZdlPv($0); //@line 7087
 return;
}
function __ZThn4_N17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 return -3002;
}
function b22(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_iiiiii(7); //@line 4874
 return 0; //@line 4874
}
function b21(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_iiiiii(0); //@line 4871
 return 0; //@line 4871
}
function __ZThn4_N17EthernetInterface11socket_sendEPvPKvj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 8388
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 6614
 __ZdlPv($0); //@line 6615
 return;
}
function __ZThn4_N17EthernetInterface11socket_recvEPvS0_j__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 931
 return;
}
function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw; //@line 32
  threwValue = value; //@line 33
 }
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 4228
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 3253
 return;
}
function __ZThn4_N17EthernetInterface14get_ip_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 864
 return;
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_6($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 8634
 return;
}
function __ZN17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 return -3002;
}
function b121(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 5153
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 4749
}
function __ZN17EthernetInterface11socket_sendEPvPKvj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1375
 return;
}
function __ZN17EthernetInterface11socket_recvEPvS0_j__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2486
 return;
}
function __ZN17EthernetInterface15get_mac_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1936
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 6811
}
function __ZN17EthernetInterface14get_ip_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2496
 return;
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_44($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 1454
 return;
}
function __ZN12NetworkStack11setstackoptEiiPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return -3002;
}
function __ZN12NetworkStack11getstackoptEiiPvPj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return -3002;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[1634] | 0; //@line 8176
 HEAP32[1634] = $0 + 0; //@line 8178
 return $0 | 0; //@line 8180
}
function __ZN17EthernetInterface11get_netmaskEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 3436
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[357] | 0; //@line 7393
 HEAP32[357] = $0 + 0; //@line 7395
 return $0 | 0; //@line 7397
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 4798
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b19(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(15); //@line 4868
 return 0; //@line 4868
}
function b18(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(14); //@line 4865
 return 0; //@line 4865
}
function b17(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(13); //@line 4862
 return 0; //@line 4862
}
function b16(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(12); //@line 4859
 return 0; //@line 4859
}
function b15(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(11); //@line 4856
 return 0; //@line 4856
}
function b14(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(10); //@line 4853
 return 0; //@line 4853
}
function __ZN6Socket11set_timeoutEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 12 >> 2] = ($1 | 0) > -1 ? $1 : -1; //@line 1672
 return;
}
function b13(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_iiiii(0); //@line 4850
 return 0; //@line 4850
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN17EthernetInterface11set_networkEPKcS1_S1___async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 8531
 return;
}
function __ZThn4_N17EthernetInterface11socket_bindEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 4569
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b119(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 5150
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6Socket5closeEv__async_cb_76($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 3516
 return;
}
function __ZN17EthernetInterface11socket_bindEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 4691
}
function _fflush__async_cb_81($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3974
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8763
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1948
 return;
}
function _fputc__async_cb_35($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 845
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_43($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 1365
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 15](a1 | 0) | 0; //@line 4742
}
function _putc__async_cb_36($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 887
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8543
 return;
}
function __ZN17EthernetInterface8set_dhcpEb__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 8249
 return;
}
function _do_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ___string_read($0, $1, $2) | 0; //@line 11028
}
function __ZThn4_N17EthernetInterface13socket_listenEPvi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function __ZN13SocketAddress8set_portEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 60 >> 1] = $1; //@line 1704
 return;
}
function b11(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(15); //@line 4847
 return 0; //@line 4847
}
function b10(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 4844
 return 0; //@line 4844
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5782, HEAP32[$0 + 4 >> 2] | 0); //@line 8807
}
function __ZN17EthernetInterface13socket_listenEPvi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorINS2_14method_contextI6SocketMS5_FvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN16NetworkInterface6attachEN4mbed8CallbackIFv11nsapi_eventiEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 4791
}
function b117(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(7); //@line 5147
}
function b116(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(6); //@line 5144
}
function b115(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 5141
}
function __ZNK13SocketAddress14get_ip_versionEv($0) {
 $0 = $0 | 0;
 return HEAP32[$0 + 40 >> 2] | 0; //@line 2529
}
function __ZN9UDPSocketD0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 854
 return;
}
function _isspace($0) {
 $0 = $0 | 0;
 return (($0 | 0) == 32 | ($0 + -9 | 0) >>> 0 < 5) & 1 | 0; //@line 10067
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 5936
}
function __ZNK13SocketAddress8get_portEv($0) {
 $0 = $0 | 0;
 return HEAP16[$0 + 60 >> 1] | 0; //@line 2348
}
function __ZThn4_N17EthernetInterfaceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0 + -4 | 0); //@line 557
 return;
}
function b8(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(7); //@line 4841
 return 0; //@line 4841
}
function b7(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(0); //@line 4838
 return 0; //@line 4838
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = -1; //@line 8817
 return;
}
function __ZN16NetworkInterface12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return -3002;
}
function __ZN17EthernetInterface9get_stackEv($0) {
 $0 = $0 | 0;
 return $0 + 4 | 0; //@line 182
}
function __Z18nsapi_create_stackP12NetworkStack($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 1204
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 4784
}
function __ZNK16NetworkInterface21get_connection_statusEv($0) {
 $0 = $0 | 0;
 return -3002;
}
function __ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb_37($0) {
 $0 = $0 | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 10015
}
function __ZN17EthernetInterfaceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0); //@line 55
 return;
}
function __ZN17EthernetInterface11get_gatewayEv($0) {
 $0 = $0 | 0;
 return 0; //@line 125
}
function __ZN17EthernetInterface10disconnectEv($0) {
 $0 = $0 | 0;
 return 0; //@line 175
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(15); //@line 4835
 return 0; //@line 4835
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(14); //@line 4832
 return 0; //@line 4832
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(13); //@line 4829
 return 0; //@line 4829
}
function b2(p0) {
 p0 = p0 | 0;
 nullFunc_ii(12); //@line 4826
 return 0; //@line 4826
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 4823
 return 0; //@line 4823
}
function __ZN17EthernetInterface7connectEv($0) {
 $0 = $0 | 0;
 return 0; //@line 169
}
function b113(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 5138
}
function b112(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 5135
}
function _copysignl($0, $1) {
 $0 = +$0;
 $1 = +$1;
 return +(+_copysign($0, $1));
}
function ___ofl_lock() {
 ___lock(6512); //@line 10652
 return 6520; //@line 10653
}
function _scalbnl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_scalbn($0, $1));
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _abort_message__async_cb_79($0) {
 $0 = $0 | 0;
 _abort(); //@line 3853
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 39
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function __ZN9UDPSocket9get_protoEv($0) {
 $0 = $0 | 0;
 return 1; //@line 2822
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 4886
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function _fmodl($0, $1) {
 $0 = +$0;
 $1 = +$1;
 return +(+_fmod($0, $1));
}
function ___pthread_self_913() {
 return _pthread_self() | 0; //@line 2961
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 5857
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 5863
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZN6SocketD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1273
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 6440
 return;
}
function __ZThn4_N17EthernetInterfaceD1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9UDPSocket5eventEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9UDPSocketD2Ev__async_cb_46($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function ___ofl_unlock() {
 ___unlock(6512); //@line 10658
 return;
}
function __ZN6SocketD2Ev__async_cb_52($0) {
 $0 = $0 | 0;
 return;
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 5132
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 5129
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 5126
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 5123
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 5120
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 5117
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 5114
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 5111
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 5108
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 5105
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 5102
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 10301
}
function __ZN17EthernetInterfaceD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 5099
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 5096
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 5093
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 5090
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 5087
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 5084
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 5081
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 5078
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 5075
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 5072
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 5069
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 5066
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 5063
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 5060
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 5057
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 5054
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 5051
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 5048
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 5045
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 5042
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 5039
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 5036
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 5033
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 5030
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 5027
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 5024
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 5021
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 5018
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 5015
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 5012
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 5009
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 5006
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 5003
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 5000
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 4997
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 4994
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 4991
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 4988
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 4985
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 4982
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 4979
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 4976
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 4973
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 4970
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 4967
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 4964
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 4961
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 4958
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 4955
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 4952
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 4949
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 4946
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 4943
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 4940
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 4937
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 4934
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 4931
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 4928
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 4925
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 4922
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 4919
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 4916
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 4913
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 4910
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 4907
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 4904
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 4901
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 4898
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 4895
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 4892
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 9973
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 4889
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZSt9terminatev__async_cb_38($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 6508; //@line 9967
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 12
}
function _core_util_critical_section_enter() {
 return;
}
function __ZSt9terminatev__async_cb($0) {
 $0 = $0 | 0;
}
function _pthread_self() {
 return 1020; //@line 10020
}
function _core_util_critical_section_exit() {
 return;
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b27() {
 nullFunc_v(0); //@line 4883
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,__ZN17EthernetInterface15get_mac_addressEv,__ZN17EthernetInterface14get_ip_addressEv,__ZN17EthernetInterface11get_netmaskEv,__ZN17EthernetInterface11get_gatewayEv,__ZN17EthernetInterface7connectEv,__ZN17EthernetInterface10disconnectEv,__ZNK16NetworkInterface21get_connection_statusEv,__ZN17EthernetInterface9get_stackEv,__ZThn4_N17EthernetInterface14get_ip_addressEv,__ZN9UDPSocket9get_protoEv,___stdio_close,b2,b3,b4,b5];
var FUNCTION_TABLE_iii = [b7,__ZN17EthernetInterface8set_dhcpEb,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress,__ZN16NetworkInterface12set_blockingEb,__ZN17EthernetInterface12socket_closeEPv,__ZN12NetworkStack14add_dns_serverERK13SocketAddress,__ZThn4_N17EthernetInterface12socket_closeEPv,b8];
var FUNCTION_TABLE_iiii = [b10,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol,__ZN17EthernetInterface11socket_bindEPvRK13SocketAddress,__ZN17EthernetInterface13socket_listenEPvi,__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol,__ZThn4_N17EthernetInterface11socket_bindEPvRK13SocketAddress,__ZThn4_N17EthernetInterface13socket_listenEPvi,__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,_do_read,b11];
var FUNCTION_TABLE_iiiii = [b13,__ZN17EthernetInterface11set_networkEPKcS1_S1_,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version,__ZN17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress,__ZN17EthernetInterface11socket_sendEPvPKvj,__ZN17EthernetInterface11socket_recvEPvS0_j,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version,__ZThn4_N17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress,__ZThn4_N17EthernetInterface11socket_sendEPvPKvj,__ZThn4_N17EthernetInterface11socket_recvEPvS0_j,b14,b15,b16,b17,b18,b19];
var FUNCTION_TABLE_iiiiii = [b21,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j,__ZN12NetworkStack11setstackoptEiiPKvj,__ZN12NetworkStack11getstackoptEiiPvPj,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j,b22];
var FUNCTION_TABLE_iiiiiii = [b24,__ZN12NetworkStack10setsockoptEPviiPKvj,__ZN12NetworkStack10getsockoptEPviiS0_Pj,b25];
var FUNCTION_TABLE_v = [b27,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b29,__ZN17EthernetInterfaceD2Ev,__ZN17EthernetInterfaceD0Ev,__ZThn4_N17EthernetInterfaceD1Ev,__ZThn4_N17EthernetInterfaceD0Ev,__ZN6SocketD2Ev,__ZN6SocketD0Ev,__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorINS2_14method_contextI6SocketMS5_FvvEEEEEvPv,__ZN9UDPSocketD2Ev,__ZN9UDPSocketD0Ev,__ZN9UDPSocket5eventEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN17EthernetInterface15get_mac_addressEv__async_cb,__ZN17EthernetInterface14get_ip_addressEv__async_cb,__ZN17EthernetInterface11get_netmaskEv__async_cb,__ZN17EthernetInterface11set_networkEPKcS1_S1___async_cb,__ZN17EthernetInterface8set_dhcpEb__async_cb,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_44,__ZN17EthernetInterface12socket_closeEPv__async_cb,__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb,__ZN17EthernetInterface11socket_sendEPvPKvj__async_cb,__ZN17EthernetInterface11socket_recvEPvS0_j__async_cb
,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_49,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_50,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_48,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_84,__ZThn4_N17EthernetInterface14get_ip_addressEv__async_cb,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_6,__ZThn4_N17EthernetInterface12socket_closeEPv__async_cb,__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb,__ZThn4_N17EthernetInterface11socket_sendEPvPKvj__async_cb,__ZThn4_N17EthernetInterface11socket_recvEPvS0_j__async_cb,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_8,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_9,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_7,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_45,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_1,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb_3,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_51,__ZN6SocketD2Ev__async_cb,__ZN6SocketD2Ev__async_cb_52,__ZN6Socket4openEP12NetworkStack__async_cb,__ZN6Socket4openEP12NetworkStack__async_cb_39,__ZN6Socket4openEP12NetworkStack__async_cb_40
,__ZN6Socket4openEP12NetworkStack__async_cb_41,__ZN6Socket4openEP12NetworkStack__async_cb_42,__ZN4mbed8CallbackIFvvEE5thunkEPv,__ZN6Socket4openEP12NetworkStack__async_cb_43,__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb_10,__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv__async_cb,__ZN6Socket5closeEv__async_cb,__ZN6Socket5closeEv__async_cb_75,__ZN6Socket5closeEv__async_cb_76,__ZN9UDPSocketD2Ev__async_cb_47,__ZN9UDPSocketD2Ev__async_cb,__ZN9UDPSocketD2Ev__async_cb_46,__ZN9UDPSocketD0Ev__async_cb,__ZN9UDPSocket5eventEv__async_cb,__ZN9UDPSocket6sendtoEPKctPKvj__async_cb,__ZN9UDPSocket6sendtoEPKctPKvj__async_cb_72,__ZN9UDPSocket6sendtoERK13SocketAddressPKvj__async_cb,__ZN9UDPSocket8recvfromEP13SocketAddressPvj__async_cb,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_34,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_31,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_26,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_33,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_32,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_30,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_25,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_29,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_24,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_28,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_23
,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_27,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb,__Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_67,_mbed_die__async_cb_66,_mbed_die__async_cb_65,_mbed_die__async_cb_64,_mbed_die__async_cb_63,_mbed_die__async_cb_62,_mbed_die__async_cb_61,_mbed_die__async_cb_60,_mbed_die__async_cb_59,_mbed_die__async_cb_58,_mbed_die__async_cb_57,_mbed_die__async_cb_56,_mbed_die__async_cb_55,_mbed_die__async_cb_54,_mbed_die__async_cb_53,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_22,_serial_putc__async_cb_5,_serial_putc__async_cb,_invoke_ticker__async_cb_21,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb_11,_main__async_cb,_main__async_cb_20
,_main__async_cb_12,_main__async_cb_14,_main__async_cb_19,_main__async_cb_13,_main__async_cb_18,_main__async_cb_16,_main__async_cb_17,_main__async_cb_15,__ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb,__ZN9UDPSocketC2I17EthernetInterfaceEEPT___async_cb_37,_putc__async_cb_36,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_81,_fflush__async_cb_80,_fflush__async_cb_82,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_74,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_printf__async_cb,_fputc__async_cb_35,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_78
,_abort_message__async_cb,_abort_message__async_cb_79,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_73,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_83,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_77,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_4,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b30,b31,b32,b33
,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63
,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87,b88,b89,b90,b91,b92,b93
,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105,b106,b107,b108,b109,b110];
var FUNCTION_TABLE_vii = [b112,__ZN16NetworkInterface6attachEN4mbed8CallbackIFv11nsapi_eventiEEE,__ZN4mbed8CallbackIFvvEE13function_moveINS2_14method_contextI6SocketMS5_FvvEEEEEvPvPKv,b113];
var FUNCTION_TABLE_viiii = [b115,__ZN17EthernetInterface13socket_attachEPvPFvS0_ES0_,__ZThn4_N17EthernetInterface13socket_attachEPvPFvS0_ES0_,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b116,b117];
var FUNCTION_TABLE_viiiii = [b119,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b121,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memmove: _memmove, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_iiiii: dynCall_iiiii, dynCall_iiiiii: dynCall_iiiiii, dynCall_iiiiiii: dynCall_iiiiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_alloc_async_context = asm["_emscripten_alloc_async_context"]; asm["_emscripten_alloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_alloc_async_context.apply(null, arguments);
};

var real__emscripten_async_resume = asm["_emscripten_async_resume"]; asm["_emscripten_async_resume"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_async_resume.apply(null, arguments);
};

var real__emscripten_free_async_context = asm["_emscripten_free_async_context"]; asm["_emscripten_free_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_free_async_context.apply(null, arguments);
};

var real__emscripten_realloc_async_context = asm["_emscripten_realloc_async_context"]; asm["_emscripten_realloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_realloc_async_context.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__handle_interrupt_in = asm["_handle_interrupt_in"]; asm["_handle_interrupt_in"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_interrupt_in.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__memmove.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setAsync = asm["setAsync"]; asm["setAsync"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setAsync.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setAsync = Module["setAsync"] = asm["setAsync"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
      exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}






//# sourceMappingURL=ntp.js.map