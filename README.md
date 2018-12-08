# bf.wasm

Compile [brainfuck](https://en.wikipedia.org/wiki/Brainfuck) to
[WebAssembly](https://webassembly.org/)

### Running

```
$ node bf.js
Hello world!
```

(Right now, the brainfuck code is just a [constant inside `bf.js`](bf.js#L31), because
:shrug:)

### ... why?

I wanted to get familiar with the WebAssembly binary format, and this seemed
like a fun way to do it!

### But is any of this useful at all?

`wasm-gen.js` contains a code generator for WebAssembly, which might be useful
to you if you're interested in doing something with the WebAssembly binary
format that's more valuable than compiling Brainfuck :)

### License

This code is licensed under the [AGPL v3](license.txt), but if for some reason you want to compile Brainfuck to WebAssembly in your proprietary Business Systems, I'm happy to grant
you permission to use this code under different terms at no charge. Just [email
me](mailto:nornagon@nornagon.net)!
