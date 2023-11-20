import * as fs from "fs";
import * as path from "path";
import * as Papa from "papaparse";
import * as xml2js from "xml2js";

const convertTimecodeToMilliseconds = (timecode: string): number => {
  const [hours, minutes, seconds, frames] = timecode.split(":").map(Number);
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + frames * 40; // Assuming 25 fps for frame to ms conversion
};

let cueIdCounter = 0; // Global counter for cue IDs

const groupCsvDataByTrack = (data: any[]): Record<string, any[]> => {
  return data.reduce((groups, item) => {
    const track = item.Track;
    if (!groups[track]) {
      groups[track] = [];
    }
    groups[track].push(item);
    return groups;
  }, {});
};

const processGroup = async (
  group: any[],
  trackInfo: string,
  templateXml: any,
  outputDir: string,
  songIndex: number = 0
) => {
  const builder = new xml2js.Builder();
  let xmlData = JSON.parse(JSON.stringify(templateXml)); // Deep clone the template XML data

  const [songName, artistName] = trackInfo
    .split(" - ")
    .map((part) => part.trim());

  // group the songs into arrays of 6
  const groupSize = 6;
  const groupIndex = Math.floor(songIndex / groupSize);
  const itemIndex = songIndex % groupSize;
  // format the "number" as group*100 + itemIndex
  const itemNumber = (groupIndex + 1) * 100 + itemIndex;
  xmlData.lexml.scene[0].$.number = itemNumber.toString();

  group.forEach((row, index) => {
    const start = convertTimecodeToMilliseconds(row.Position);

    let end;
    if (group[index + 1])
      end = convertTimecodeToMilliseconds(group[index + 1].Position);
    else end = start + 200000;
    // Ensure the cue does not overlap with the next cue
    // Introduce a minimum duration for each cue (e.g., 500 milliseconds)
    const minDuration = 1;
    const duration = Math.max(minDuration, end - start);

    const desc = row.Label;

    // extract bpm from track-name by searching for 2 or 3 digit number+"bpm"
    const bpmMatch = trackInfo.match(/\d{2,3}bpm/);
    const bpm = bpmMatch ? bpmMatch[0].replace("bpm", "") : "120";

    const cue = {
      $: {
        id: `c${cueIdCounter++}`,
        reset: "false",
        start: start.toString(),
        duration: duration.toString(),
        desc: desc,
        tempo: bpm,
        signature: "1",
        value: 9,
      },
    };

    xmlData.lexml.scene[0].$.name = songName;
    xmlData.lexml.scene[0].$.artist = artistName;

    xmlData.lexml.scene[0].spine[0].track.forEach((track: any) => {
      if (track.$.type === "time") {
        if (!track.cue) track.cue = [];
        track.cue.push(cue);
      }
    });

    // set ids for all cues
    cueIdCounter = 0;
    xmlData.lexml.scene[0].spine[0]?.track?.forEach((track: any) => {
      track.cue?.forEach((cue: any, index: number) => {
        cue.$.id = `c${cueIdCounter}`;
        cueIdCounter++;
      });
    });
  });

  let newXml = builder.buildObject(xmlData);

  // insert <!DOCTYPE lexml> at second line
  const lines = newXml.split("\n");
  lines.splice(1, 0, "<!DOCTYPE lexml>");
  newXml = lines.join("\n");

  fs.writeFileSync(
    path.join(outputDir, `${itemNumber} ${songName} - ${artistName}.lexml`),
    newXml
  );

  console.log(
    "XML updated and saved for:",
    itemNumber,
    songName,
    "-",
    artistName
  );
};

const processCsvAndXml = async (
  csvFilePath: string,
  xmlFilePath: string,
  outputDir: string
) => {
  const csvContent = fs.readFileSync(csvFilePath, "utf8");
  const xmlContent = fs.readFileSync(xmlFilePath, "utf8");

  const parser = new xml2js.Parser();
  const templateXml = await parser.parseStringPromise(xmlContent);

  let index = 0;
  Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    complete: async (result) => {
      const groups = groupCsvDataByTrack(result.data);
      for (const song in groups) {
        await processGroup(groups[song], song, templateXml, outputDir, index);
        index++;
      }
    },
  });
};

const inputDir = "input";
const xmlFilePath = "template.lexml";
const outputDir = "output/liveedit";

const processDirectory = (inputDir: string, outputDir: string) => {
  fs.readdirSync(inputDir).forEach((file) => {
    if (path.extname(file).toLowerCase() === ".csv") {
      const csvFilePath = path.join(inputDir, file);
      processCsvAndXml(csvFilePath, xmlFilePath, outputDir);
    }
  });
};

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

processDirectory(inputDir, outputDir);
