import collections
import csv
import http
import os
import pprint
import sys
import textwrap
import time
from pprint import pprint

import requests

WEBHOOK = os.getenv("DISCORD_WEBHOOK", "")
DISCORD_MESSAGE_LENGTH_LIMIT = 2000
DELAY_BETWEEN_MESSAGES = 60
NEW_RESPONSES_LIMIT = 100
FORM_RESPONSES_FILE = sys.argv[1]
EXISTING_RESPONSES_FILE = sys.argv[2]


def load_responses(filename):
    with open(filename, newline="") as csvfile:
        spreadsheet = list(csv.reader(csvfile, delimiter=",", quotechar='"'))
        fields = [
            s.strip(":").replace(" ", "_").replace("/", "").replace("?", "")
            for s in spreadsheet[0]
        ]
        return spreadsheet[1:], fields


def save_response(filename, row):
    with open(filename, "a", newline="") as csvfile:
        writer = csv.writer(
            csvfile, delimiter=",", quotechar='"', quoting=csv.QUOTE_MINIMAL
        )
        writer.writerow(row)


def format_rating(rating):
    return "🌟" * int(rating)


def horizontal_line(length=200):
    return f"~~{' ' * length}~~"


def format_form_response(response):
    messages = []
    messages.append(
        textwrap.dedent(f"""\
        {horizontal_line()}
        # 📝 **{response.Scenario_name}** - New Feedback Submission
        **Overall Rating:** {format_rating(response.Overall_rating)}
        **Players/Factions:** {response.Factions_used}
        **Play Time:** {response.Play_time__hours} hours
        **Difficulty:** {response.Difficulty}

        **Starting Conditions:**
        - Resources: {response.Starting_Resources}
        - Income: {response.Starting_Income}
        - Buildings: {response.Starting_Buildings}
        - Units: {response.Starting_Units}

        **Scenario Features:**
        - Victory/Defeat: {response.Victory__Defeat_Conditions}
        - Timed Events: {response.Timed_Events__Additional_Rules}
        """)
    )

    if response.What_did_you_like_the_most:
        messages.append(
            textwrap.dedent(f"""
            ### ✅ What worked well:
            {response.What_did_you_like_the_most}
            """)
        )

    if response.What_could_be_improved:
        messages.append(
            textwrap.dedent(f"""
            ### 🤔 What could be improved:
            {response.What_could_be_improved}
            """)
        )

    if response.Other_suggestions:
        messages.append(
            textwrap.dedent(f"""
            ### 💡 Other suggestions:
            {response.Other_suggestions}
            """)
        )

    messages.append(
        textwrap.dedent(f"""
        *Submitted: {response.Timestamp}*
        """)
    )
    total_messages = "\n".join(messages)
    if len(total_messages) > DISCORD_MESSAGE_LENGTH_LIMIT:
        return messages
    return [total_messages]


if __name__ == "__main__":
    responses, fields = load_responses(FORM_RESPONSES_FILE)
    print("Parsed form fields:")
    pprint(fields)
    Response = collections.namedtuple("Response", fields)
    existing_responses, _ = load_responses(EXISTING_RESPONSES_FILE)

    new_responses = [r for r in responses if r not in existing_responses]
    if new_responses:
        print("New responses:", len(new_responses))
        if len(new_responses) > NEW_RESPONSES_LIMIT:
            print(
                f"Too many new responses: {len(new_responses)}. Check for potential abuse."
            )
            sys.exit(1)
        for r in new_responses:
            pprint(r)
            form_response = Response(*r)
            for m in format_form_response(form_response):
                response = requests.post(WEBHOOK, json={"content": m})
                if response.status_code != http.HTTPStatus.NO_CONTENT:
                    print(response.content.decode())
                    sys.exit(1)
            save_response(EXISTING_RESPONSES_FILE, r)
            if len(new_responses) > 1:
                time.sleep(DELAY_BETWEEN_MESSAGES)
    else:
        print("No new responses, bye.")
