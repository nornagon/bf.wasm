function* uleb128(v) {
  do {
    let byte = v & 0b1111111
    v >>>= 7
    if (v != 0) {
      byte |= 0b10000000
    }
    yield byte
  } while (v != 0)
}

function* sleb128(v) {
  let more = 1
  let negative = v < 0
  while (more) {
    let byte = v & 0b1111111
    v >>= 7

    if ((v === 0 && ((byte & 0x40) === 0)) || (v === -1 && ((byte & 0x40) !== 0)))
      more = 0
    else
      byte |= 0b10000000
    yield byte
  }
}

function* varintN(v, n) {
  let byteLimit = Math.ceil(n/7)
  for (let b of sleb128(v)) {
    if (byteLimit === 0) throw new Error(`Value ${v} does not fit in varuint${n}`)
    yield b
    byteLimit--
  }
}
function* varuintN(v, n) {
  let byteLimit = Math.ceil(n/7)
  for (let b of uleb128(v)) {
    if (byteLimit === 0) throw new Error(`Value ${v} does not fit in varuint${n}`)
    yield b
    byteLimit--
  }
}

function varint7(v) { return varintN(v, 7) }
function varint32(v) { return varintN(v, 32) }
function varint64(v) { return varintN(v, 64) }
function varuint1(v) { return varuintN(v, 1) }
function varuint7(v) { return varuintN(v, 7) }
function varuint32(v) { return varuintN(v, 32) }

function* uint32(v) {
  yield v & 0xff
  v >>>= 8
  yield v & 0xff
  v >>>= 8
  yield v & 0xff
  v >>>= 8
  yield v & 0xff
}

const SECTION_CUSTOM = 0
const SECTION_TYPE = 1
const SECTION_IMPORT = 2
const SECTION_FUNCTION = 3
const SECTION_TABLE = 4
const SECTION_MEMORY = 5
const SECTION_GLOBAL = 6
const SECTION_EXPORT = 7
const SECTION_START = 8
const SECTION_ELEMENT = 9
const SECTION_CODE = 10
const SECTION_DATA = 11

const TYPE_I32 = -0x01
const TYPE_I64 = -0x02
const TYPE_F32 = -0x03
const TYPE_F64 = -0x04
const TYPE_ANYFUNC = -0x10
const TYPE_FUNC = -0x20
const TYPE_EMPTY_BLOCK = -0x40

class Writer {
  constructor(buf) {
    this.buf = buf
    this.loc = 0
  }

  write(v) {
    for (let b of v) {
      this.buf[this.loc] = b
      this.loc += 1
    }
  }
}

class Sizer {
  constructor() {
    this.size = 0
  }

  write(v) {
    for (let b of v) {
      this.size += 1
    }
  }
}

class Flattenable {
  flatten(w) {
    throw new Error(`flatten not implemented!`)
  }
  toBuffer() {
    const d = new Uint8Array(this.flattenedSize())
    this.flatten(new Writer(d))
    return d
  }
  flattenedSize() {
    const s = new Sizer
    this.flatten(s)
    return s.size
  }
}

class FuncType extends Flattenable {
  constructor(param_types, return_type) {
    super()
    this.form = TYPE_FUNC
    this.param_types = param_types
    this.return_types = return_type ? [return_type] : []
  }

  flatten(w) {
    w.write(varint7(this.form))
    w.write(varuint32(this.param_types.length))
    this.param_types.forEach(t => {
      w.write(varint7(t))
    })
    w.write(varuint1(this.return_types.length))
    this.return_types.forEach(t => {
      w.write(varint7(t))
    })
  }
}

class FuncBody extends Flattenable {
  constructor() {
    super()
    this.locals = new ArraySection
    this.code = []
  }

  flatten(w) {
    this.locals.flatten(w)
    w.write(this.code)
    w.write([0x0b])
  }
}

class LocalEntry extends Flattenable {
  constructor(count, type) {
    super()
    this.count = count
    this.type = type
  }

  flatten(w) {
    w.write(varuint32(this.count))
    w.write(varint7(this.type))
  }
}

class Index extends Flattenable {
  constructor(i) {
    super()
    this.index = i
  }

  flatten(w) {
    w.write(varuint32(this.index))
  }
}

const EXTERNAL_KIND_FUNCTION = 0
const EXTERNAL_KIND_TABLE = 1
const EXTERNAL_KIND_MEMORY = 2
const EXTERNAL_KIND_GLOBAL = 3

class ResizableLimits extends Flattenable {
  constructor(initial, maximum) {
    super()
    this.initial = initial
    this.maximum = maximum
  }

  flatten(w) {
    w.write(varuint1(this.maximum != null ? 1 : 0))
    w.write(varuint32(this.initial))
    if (this.maximum != null) {
      w.write(varuint32(this.maximum))
    }
  }
}

const MemoryType = ResizableLimits
const FunctionImportType = Index

class ImportEntry extends Flattenable {
  constructor(module, field, kind, type) {
    super()
    this.module = module
    this.field = field
    this.kind = kind
    this.type = type
  }

  flatten(w) {
    w.write(varuint32(this.module.length))
    w.write((new TextEncoder).encode(this.module))
    w.write(varuint32(this.field.length))
    w.write((new TextEncoder).encode(this.field))
    w.write([this.kind])
    this.type.flatten(w)
  }
}

class ExportEntry extends Flattenable {
  constructor(field, kind, index) {
    super()
    this.field = field
    this.kind = kind
    this.index = index
  }

  flatten(w) {
    w.write(varuint32(this.field.length))
    w.write((new TextEncoder).encode(this.field))
    w.write([this.kind])
    w.write(varuint32(this.index))
  }
}

// payload_size: varuint32
// payload: *
class SizedSection extends Flattenable {
  constructor(data) {
    super()
    this.data = data
  }

  flatten(w) {
    w.write(varuint32(this.data.flattenedSize()))
    this.data.flatten(w)
  }
}

// for data of the form
// count: varuint32
// entries: elem_type*
class ArraySection extends Flattenable {
  constructor() {
    super()
    this.elements = []
  }

  add(elem) {
    this.elements.push(elem)
  }

  flatten(w) {
    w.write(varuint32(this.elements.length))
    this.elements.forEach(e => {
      e.flatten(w)
    })
  }
}

class TaggedSection extends Flattenable {
  constructor(tag, data) {
    super()
    this.tag = tag
    this.data = data
  }

  flatten(w) {
    w.write(varuint7(this.tag))
    this.data.flatten(w)
  }
}

class Module extends Flattenable {
  constructor() {
    super()
    this.sections = []

    const mkSection = (type) => {
      const s = new ArraySection()
      this.sections.push(new TaggedSection(type, new SizedSection(s)))
      return s
    }
    this.type_section = mkSection(SECTION_TYPE)
    this.import_section = mkSection(SECTION_IMPORT)
    this.function_section = mkSection(SECTION_FUNCTION)
    // table
    this.memory_section = mkSection(SECTION_MEMORY)
    // global
    this.export_section = mkSection(SECTION_EXPORT)
    // start
    // element
    this.code_section = mkSection(SECTION_CODE)
    // data
  }

  flatten(w) {
    w.write(uint32(0x6d736100)) // \0asm
    w.write(uint32(1)) // version
    this.sections.forEach(s => {
      if (s.data.data.elements.length)
        s.flatten(w)
    })
  }
}

module.exports = {
  Module,
  FuncType,
  FuncBody,
  LocalEntry,
  SizedSection,
  Index,
  type: {
    i32: TYPE_I32,
    i64: TYPE_I64,
    f32: TYPE_F32,
    f64: TYPE_F64,
    empty_block: TYPE_EMPTY_BLOCK
  },
  external_kind: {
    func: EXTERNAL_KIND_FUNCTION,
    table: EXTERNAL_KIND_TABLE,
    memory: EXTERNAL_KIND_MEMORY,
    global: EXTERNAL_KIND_GLOBAL,
  },
  MemoryType,
  ImportEntry,
  FunctionImportType,
  ExportEntry,
  varint32,
  varint7,
  varuint32,
}
