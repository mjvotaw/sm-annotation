const LAMBDA_GET_NEXT_SONG =
  "https://fvzwv57y4dzkar626oks7kr5tu0opmju.lambda-url.us-east-1.on.aws/"
const LAMBDA_SAVE_ANNOTATION =
  "https://sagnvg4uvaqnganzsmjg3egryu0pqapk.lambda-url.us-east-1.on.aws/"

interface GetNextSongResponse {
  song_title: string
  sm_url: string
  audio_url: string
}

export async function getNextSong() {
  const response = await fetch(LAMBDA_GET_NEXT_SONG)
  const responseJson: GetNextSongResponse = await response.json()

  return responseJson
}
