const wasm = require('./wasm-gen')
const {varint32, varuint32, varint7} = wasm

const m = new wasm.Module
m.type_section.add(new wasm.FuncType([])) // () => void
m.type_section.add(new wasm.FuncType([wasm.type.i32])) // (i32) => void
m.type_section.add(new wasm.FuncType([], wasm.type.i32)) // () => i32

m.import_section.add(new wasm.ImportEntry(
  "io", "write", wasm.external_kind.func,
  new wasm.FunctionImportType(1)
))
m.import_section.add(new wasm.ImportEntry(
  "io", "read", wasm.external_kind.func,
  new wasm.FunctionImportType(2)
))
m.function_section.add(new wasm.Index(0)) // run()
m.export_section.add(new wasm.ExportEntry("run", wasm.external_kind.func, 2))
m.memory_section.add(new wasm.MemoryType(1))
const f = new wasm.FuncBody()
f.locals.add(new wasm.LocalEntry(1, wasm.type.i32)) // $p

// i32.const 0
f.code.push(0x41)
f.code.push(...varint32(0))
// set_local 0
f.code.push(0x21)
f.code.push(...varuint32(0))

const bf_string = `
[ This program prints "Hello World!" and a newline to the screen, its
  length is 106 active command characters. [It is not the shortest.]

  This loop is an "initial comment loop", a simple way of adding a comment
  to a BF program such that you don't have to worry about any command
  characters. Any ".", ",", "+", "-", "<" and ">" characters are simply
  ignored, the "[" and "]" characters just have to be balanced. This
  loop and the commands it contains are ignored because the current cell
  defaults to a value of 0; the 0 value causes this loop to be skipped.
]
++++++++               Set Cell #0 to 8
[
    >++++               Add 4 to Cell #1; this will always set Cell #1 to 4
    [                   as the cell will be cleared by the loop
        >++             Add 2 to Cell #2
        >+++            Add 3 to Cell #3
        >+++            Add 3 to Cell #4
        >+              Add 1 to Cell #5
        <<<<-           Decrement the loop counter in Cell #1
    ]                   Loop till Cell #1 is zero; number of iterations is 4
    >+                  Add 1 to Cell #2
    >+                  Add 1 to Cell #3
    >-                  Subtract 1 from Cell #4
    >>+                 Add 1 to Cell #6
    [<]                 Move back to the first zero cell you find; this will
                        be Cell #1 which was cleared by the previous loop
    <-                  Decrement the loop Counter in Cell #0
]                       Loop till Cell #0 is zero; number of iterations is 8

The result of this is:
Cell No :   0   1   2   3   4   5   6
Contents:   0   0  72 104  88  32   8
Pointer :   ^

>>.                     Cell #2 has value 72 which is 'H'
>---.                   Subtract 3 from Cell #3 to get 101 which is 'e'
+++++++..+++.           Likewise for 'llo' from Cell #3
>>.                     Cell #5 is 32 for the space
<-.                     Subtract 1 from Cell #4 for 87 to give a 'W'
<.                      Cell #3 was set to 'o' from the end of 'Hello'
+++.------.--------.    Cell #3 for 'rl' and 'd'
>>+.                    Add 1 to Cell #5 gives us an exclamation point
>++.                    And finally a newline from Cell #6
`

for (let c of bf_string) {
  switch (c) {
    case '+':
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // i32.load8_u 
      f.code.push(0x2d, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      // i32.const 1
      f.code.push(0x41, ...varint32(1))
      // i32.add
      f.code.push(0x6a)
      // i32.store8
      f.code.push(0x3a, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      break;
    case '-':
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // i32.load8_u 
      f.code.push(0x2d, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      // i32.const 1
      f.code.push(0x41, ...varint32(1))
      // i32.sub
      f.code.push(0x6b)
      // i32.store8
      f.code.push(0x3a, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      break;
    case '>':
      // get_local $p
      f.code.push(0x20)
      f.code.push(...varuint32(0))
      // i32.const 1
      f.code.push(0x41)
      f.code.push(...varint32(1))
      // i32.add
      f.code.push(0x6a)
      // set_local $p
      f.code.push(0x21)
      f.code.push(...varuint32(0))
      break;
    case '<':
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // i32.const 1
      f.code.push(0x41, ...varint32(1))
      // i32.add
      f.code.push(0x6b)
      // set_local $p
      f.code.push(0x21, ...varuint32(0))
      break;
    case '[':
      // block void
      f.code.push(0x02, ...varint7(wasm.type.empty_block))
      // loop void
      f.code.push(0x03, ...varint7(wasm.type.empty_block))
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // i32.load8_u
      f.code.push(0x2d, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      // i32.eqz
      f.code.push(0x45)
      // br_if 1
      f.code.push(0x0d, ...varuint32(1))
      break;
    case ']':
      // br 0
      f.code.push(0x0c, ...varuint32(0))
      // end
      f.code.push(0x0b)
      // end
      f.code.push(0x0b)
      break;
    case '.':
      // get_local $p
      f.code.push(0x20, ...varuint32(0))
      // i32.load8_u
      f.code.push(0x2d, /* alignment */...varuint32(0), /* offset */...varuint32(0))
      // call 0
      f.code.push(0x10, ...varuint32(0))
      break;
    case ',':
      break;
    default:
      break;
  }
}

f.code.push(0x0f) // return
m.code_section.add(new wasm.SizedSection(f))

WebAssembly.instantiate(m.toBuffer(), {
  io: {
    read: () => { throw new Error("can't read yet") },
    write: (c) => { process.stdout.write(String.fromCharCode(c)) },
  }
}).then(result => {
  result.instance.exports.run()
}).catch(e => {
  console.error(e)
})
