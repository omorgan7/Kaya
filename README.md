#  ![kaya](https://github.com/omorgan7/Kaya/blob/master/kaya.png) Kaya

A simple Dota 2 replay parser written in Node.js, to return the final score screen for an input replay.

## Current known issues

* No entity parsing (!!)
  * This means that the returned player xpm and gpm are completely wrong.
* No async parsing of replays.

## Building

You must have protoc installed. For instructions on doing that, please see Google's Github repo, [here](https://github.com/protocolbuffers/protobuf/blob/master/src/README.md).

1) Clone this repo.
2) Fetch the latest and greatest protos:

```sh
npm run-script proto_build
```

3) Try the example:

```sh
node example.js <replay-file-path>
```

## License

This project is licensed under the MIT license.

## Acknowledgements

Huge amounts of this project have been ported from Dotabuff's [Manta](https://github.com/dotabuff/manta) and SkadiStats' [Clarity](https://github.com/skadistats/clarity), and I am very grateful for the opensourceness of this code to get me off the ground.