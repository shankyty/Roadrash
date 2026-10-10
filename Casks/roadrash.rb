cask "roadrash" do
  version "3.13.0"
  sha256 "56d97ae75e80e4d37258f65c09c8c2366daf47e04582f029bd81ddc91c9c765c"

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
