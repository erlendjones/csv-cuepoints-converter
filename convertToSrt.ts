import * as fs from "fs";
import * as path from "path";
import * as Papa from "papaparse";

const convertTimecodeToSrtFormat = (timecode: string): string => {
  if (!timecode) {
    return "(NO TC)";
  }
  let parts = timecode.split(":");
  let frames = parseInt(parts.pop() || "0", 10);
  let milliseconds = Math.floor((frames / 25) * 1000); // Assuming 25 frames per second
  return parts.join(":") + "," + milliseconds.toString().padStart(3, "0");
};

const groupByTrack = (data: any[]): Record<string, any[]> => {
  // remove header row
  data.shift();

  return data.reduce((groups, item) => {
    const track = item[0];
    if (!groups[track]) {
      groups[track] = [];
    }
    groups[track].push(item);
    return groups;
  }, {});
};

const convertCsvToSrt = (csvFilePath: string, outputDir: string) => {
  const fileContent = fs.readFileSync(csvFilePath, "utf8");

  Papa.parse(fileContent, {
    header: false,
    complete: (result) => {
      const groups = groupByTrack(result.data);

      for (const track in groups) {
        let srtContent = "";
        const items = groups[track];
        for (let i = 0; i < items.length - 1; i++) {
          let current: any = items[i];
          let next: any = items[i + 1];
          srtContent += i + 1 + "\n";
          srtContent +=
            convertTimecodeToSrtFormat(current[2]) +
            " --> " +
            convertTimecodeToSrtFormat(next[2]) +
            "\n";
          srtContent += current[4] + "\n\n";
        }

        const srtFilePath = path.join(outputDir, track + ".srt");
        fs.writeFileSync(srtFilePath, srtContent);
        console.log("Conversion completed for track:", track);
      }
    },
  });
};

const processDirectory = (inputDir: string, outputDir: string) => {
  fs.readdirSync(inputDir).forEach((file) => {
    if (path.extname(file).toLowerCase() === ".csv") {
      const csvFilePath = path.join(inputDir, file);
      convertCsvToSrt(csvFilePath, outputDir);
    }
  });
};

const inputDir = "input"; // Or use process.argv[2] to take input from command line
const outputDir = "output/srt";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

processDirectory(inputDir, outputDir);
