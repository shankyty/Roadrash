cask "roadrash" do
  version "3.15.1"
  sha256 "7ad8604be80dab11659db81b412f53a4f12aaec0388621345c09597d7bb63fb0"

  url "https://github.com/shankyty/Roadrash/releases/download/v#{version}/RoadRash.dmg"
  name "Road Rash: Rickshaw Rumble"
  desc "Road Rash-style combat racer where you drive an auto-rickshaw through Indian cities"
  homepage "https://github.com/shankyty/Roadrash"

  depends_on macos: :ventura

  app "Road Rash.app"

  # The app is ad-hoc signed (not notarized); clear quarantine so it opens without a Gatekeeper prompt.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/Road Rash.app"]
  end

  zap trash: [
    "~/Library/Saved Application State/com.shashanktyagi.roadrash-rickshaw.savedState",
    "~/Library/WebKit/com.shashanktyagi.roadrash-rickshaw",
    "~/Library/WebKit/RoadRash",
  ]
end
