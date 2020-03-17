# popntowav
Tool for rendering pop'n music IFS/chart files to 16-bit PCM wav.

## Dependencies

Currently this tool relies on [IFSTools](https://github.com/mon/ifstools), which should be used either from an installed Python package, or through its exe distributions.
Additionally, this tool uses the following node packages:
  - wav
  - node-libsamplerate (Requires C build tools to install)

## Usage
```node popntowav [IFS file]```

I'll probably add further options for chart/container files not inside an IFS file at some point. Maybe some tweaking for desired sample rate, etc.

## Acknowledgements

Thanks to [Emi](https://github.com/EmiMidnight) and though for help with this nonsense.

## License

Yar har. Just think of me if you want to use this. Maybe even write my name down on a piece of paper somewhere.
